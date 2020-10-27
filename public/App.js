'use strict';

function noop() { }
function run(fn) {
    return fn();
}
function blank_object() {
    return Object.create(null);
}
function run_all(fns) {
    fns.forEach(run);
}
function is_function(thing) {
    return typeof thing === 'function';
}
function safe_not_equal(a, b) {
    return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
}
function subscribe(store, ...callbacks) {
    if (store == null) {
        return noop;
    }
    const unsub = store.subscribe(...callbacks);
    return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
}
function get_store_value(store) {
    let value;
    subscribe(store, _ => value = _)();
    return value;
}

let current_component;
function set_current_component(component) {
    current_component = component;
}
function get_current_component() {
    if (!current_component)
        throw new Error('Function called outside component initialization');
    return current_component;
}
function onMount(fn) {
    get_current_component().$$.on_mount.push(fn);
}
function onDestroy(fn) {
    get_current_component().$$.on_destroy.push(fn);
}
function setContext(key, context) {
    get_current_component().$$.context.set(key, context);
}
function getContext(key) {
    return get_current_component().$$.context.get(key);
}
const escaped = {
    '"': '&quot;',
    "'": '&#39;',
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;'
};
function escape(html) {
    return String(html).replace(/["'&<>]/g, match => escaped[match]);
}
function each(items, fn) {
    let str = '';
    for (let i = 0; i < items.length; i += 1) {
        str += fn(items[i], i);
    }
    return str;
}
const missing_component = {
    $$render: () => ''
};
function validate_component(component, name) {
    if (!component || !component.$$render) {
        if (name === 'svelte:component')
            name += ' this={...}';
        throw new Error(`<${name}> is not a valid SSR component. You may need to review your build config to ensure that dependencies are compiled, rather than imported as pre-compiled modules`);
    }
    return component;
}
let on_destroy;
function create_ssr_component(fn) {
    function $$render(result, props, bindings, slots) {
        const parent_component = current_component;
        const $$ = {
            on_destroy,
            context: new Map(parent_component ? parent_component.$$.context : []),
            // these will be immediately discarded
            on_mount: [],
            before_update: [],
            after_update: [],
            callbacks: blank_object()
        };
        set_current_component({ $$ });
        const html = fn(result, props, bindings, slots);
        set_current_component(parent_component);
        return html;
    }
    return {
        render: (props = {}, options = {}) => {
            on_destroy = [];
            const result = { title: '', head: '', css: new Set() };
            const html = $$render(result, props, {}, options);
            run_all(on_destroy);
            return {
                html,
                css: {
                    code: Array.from(result.css).map(css => css.code).join('\n'),
                    map: null // TODO
                },
                head: result.title + result.head
            };
        },
        $$render
    };
}
function add_attribute(name, value, boolean) {
    if (value == null || (boolean && !value))
        return '';
    return ` ${name}${value === true ? '' : `=${typeof value === 'string' ? JSON.stringify(escape(value)) : `"${value}"`}`}`;
}

const subscriber_queue = [];
/**
 * Creates a `Readable` store that allows reading by subscription.
 * @param value initial value
 * @param {StartStopNotifier}start start and stop notifications for subscriptions
 */
function readable(value, start) {
    return {
        subscribe: writable(value, start).subscribe
    };
}
/**
 * Create a `Writable` store that allows both updating and reading by subscription.
 * @param {*=}value initial value
 * @param {StartStopNotifier=}start start and stop notifications for subscriptions
 */
function writable(value, start = noop) {
    let stop;
    const subscribers = [];
    function set(new_value) {
        if (safe_not_equal(value, new_value)) {
            value = new_value;
            if (stop) { // store is ready
                const run_queue = !subscriber_queue.length;
                for (let i = 0; i < subscribers.length; i += 1) {
                    const s = subscribers[i];
                    s[1]();
                    subscriber_queue.push(s, value);
                }
                if (run_queue) {
                    for (let i = 0; i < subscriber_queue.length; i += 2) {
                        subscriber_queue[i][0](subscriber_queue[i + 1]);
                    }
                    subscriber_queue.length = 0;
                }
            }
        }
    }
    function update(fn) {
        set(fn(value));
    }
    function subscribe(run, invalidate = noop) {
        const subscriber = [run, invalidate];
        subscribers.push(subscriber);
        if (subscribers.length === 1) {
            stop = start(set) || noop;
        }
        run(value);
        return () => {
            const index = subscribers.indexOf(subscriber);
            if (index !== -1) {
                subscribers.splice(index, 1);
            }
            if (subscribers.length === 0) {
                stop();
                stop = null;
            }
        };
    }
    return { set, update, subscribe };
}
function derived(stores, fn, initial_value) {
    const single = !Array.isArray(stores);
    const stores_array = single
        ? [stores]
        : stores;
    const auto = fn.length < 2;
    return readable(initial_value, (set) => {
        let inited = false;
        const values = [];
        let pending = 0;
        let cleanup = noop;
        const sync = () => {
            if (pending) {
                return;
            }
            cleanup();
            const result = fn(single ? values[0] : values, set);
            if (auto) {
                set(result);
            }
            else {
                cleanup = is_function(result) ? result : noop;
            }
        };
        const unsubscribers = stores_array.map((store, i) => subscribe(store, (value) => {
            values[i] = value;
            pending &= ~(1 << i);
            if (inited) {
                sync();
            }
        }, () => {
            pending |= (1 << i);
        }));
        inited = true;
        sync();
        return function stop() {
            run_all(unsubscribers);
            cleanup();
        };
    });
}

const LOCATION = {};
const ROUTER = {};

/**
 * Adapted from https://github.com/reach/router/blob/b60e6dd781d5d3a4bdaaf4de665649c0f6a7e78d/src/lib/history.js
 *
 * https://github.com/reach/router/blob/master/LICENSE
 * */

function getLocation(source) {
  return {
    ...source.location,
    state: source.history.state,
    key: (source.history.state && source.history.state.key) || "initial"
  };
}

function createHistory(source, options) {
  const listeners = [];
  let location = getLocation(source);

  return {
    get location() {
      return location;
    },

    listen(listener) {
      listeners.push(listener);

      const popstateListener = () => {
        location = getLocation(source);
        listener({ location, action: "POP" });
      };

      source.addEventListener("popstate", popstateListener);

      return () => {
        source.removeEventListener("popstate", popstateListener);

        const index = listeners.indexOf(listener);
        listeners.splice(index, 1);
      };
    },

    navigate(to, { state, replace = false } = {}) {
      state = { ...state, key: Date.now() + "" };
      // try...catch iOS Safari limits to 100 pushState calls
      try {
        if (replace) {
          source.history.replaceState(state, null, to);
        } else {
          source.history.pushState(state, null, to);
        }
      } catch (e) {
        source.location[replace ? "replace" : "assign"](to);
      }

      location = getLocation(source);
      listeners.forEach(listener => listener({ location, action: "PUSH" }));
    }
  };
}

// Stores history entries in memory for testing or other platforms like Native
function createMemorySource(initialPathname = "/") {
  let index = 0;
  const stack = [{ pathname: initialPathname, search: "" }];
  const states = [];

  return {
    get location() {
      return stack[index];
    },
    addEventListener(name, fn) {},
    removeEventListener(name, fn) {},
    history: {
      get entries() {
        return stack;
      },
      get index() {
        return index;
      },
      get state() {
        return states[index];
      },
      pushState(state, _, uri) {
        const [pathname, search = ""] = uri.split("?");
        index++;
        stack.push({ pathname, search });
        states.push(state);
      },
      replaceState(state, _, uri) {
        const [pathname, search = ""] = uri.split("?");
        stack[index] = { pathname, search };
        states[index] = state;
      }
    }
  };
}

// Global history uses window.history as the source if available,
// otherwise a memory history
const canUseDOM = Boolean(
  typeof window !== "undefined" &&
    window.document &&
    window.document.createElement
);
const globalHistory = createHistory(canUseDOM ? window : createMemorySource());

/**
 * Adapted from https://github.com/reach/router/blob/b60e6dd781d5d3a4bdaaf4de665649c0f6a7e78d/src/lib/utils.js
 *
 * https://github.com/reach/router/blob/master/LICENSE
 * */

const paramRe = /^:(.+)/;

const SEGMENT_POINTS = 4;
const STATIC_POINTS = 3;
const DYNAMIC_POINTS = 2;
const SPLAT_PENALTY = 1;
const ROOT_POINTS = 1;

/**
 * Check if `segment` is a root segment
 * @param {string} segment
 * @return {boolean}
 */
function isRootSegment(segment) {
  return segment === "";
}

/**
 * Check if `segment` is a dynamic segment
 * @param {string} segment
 * @return {boolean}
 */
function isDynamic(segment) {
  return paramRe.test(segment);
}

/**
 * Check if `segment` is a splat
 * @param {string} segment
 * @return {boolean}
 */
function isSplat(segment) {
  return segment[0] === "*";
}

/**
 * Split up the URI into segments delimited by `/`
 * @param {string} uri
 * @return {string[]}
 */
function segmentize(uri) {
  return (
    uri
      // Strip starting/ending `/`
      .replace(/(^\/+|\/+$)/g, "")
      .split("/")
  );
}

/**
 * Strip `str` of potential start and end `/`
 * @param {string} str
 * @return {string}
 */
function stripSlashes(str) {
  return str.replace(/(^\/+|\/+$)/g, "");
}

/**
 * Score a route depending on how its individual segments look
 * @param {object} route
 * @param {number} index
 * @return {object}
 */
function rankRoute(route, index) {
  const score = route.default
    ? 0
    : segmentize(route.path).reduce((score, segment) => {
        score += SEGMENT_POINTS;

        if (isRootSegment(segment)) {
          score += ROOT_POINTS;
        } else if (isDynamic(segment)) {
          score += DYNAMIC_POINTS;
        } else if (isSplat(segment)) {
          score -= SEGMENT_POINTS + SPLAT_PENALTY;
        } else {
          score += STATIC_POINTS;
        }

        return score;
      }, 0);

  return { route, score, index };
}

/**
 * Give a score to all routes and sort them on that
 * @param {object[]} routes
 * @return {object[]}
 */
function rankRoutes(routes) {
  return (
    routes
      .map(rankRoute)
      // If two routes have the exact same score, we go by index instead
      .sort((a, b) =>
        a.score < b.score ? 1 : a.score > b.score ? -1 : a.index - b.index
      )
  );
}

/**
 * Ranks and picks the best route to match. Each segment gets the highest
 * amount of points, then the type of segment gets an additional amount of
 * points where
 *
 *  static > dynamic > splat > root
 *
 * This way we don't have to worry about the order of our routes, let the
 * computers do it.
 *
 * A route looks like this
 *
 *  { path, default, value }
 *
 * And a returned match looks like:
 *
 *  { route, params, uri }
 *
 * @param {object[]} routes
 * @param {string} uri
 * @return {?object}
 */
function pick(routes, uri) {
  let match;
  let default_;

  const [uriPathname] = uri.split("?");
  const uriSegments = segmentize(uriPathname);
  const isRootUri = uriSegments[0] === "";
  const ranked = rankRoutes(routes);

  for (let i = 0, l = ranked.length; i < l; i++) {
    const route = ranked[i].route;
    let missed = false;

    if (route.default) {
      default_ = {
        route,
        params: {},
        uri
      };
      continue;
    }

    const routeSegments = segmentize(route.path);
    const params = {};
    const max = Math.max(uriSegments.length, routeSegments.length);
    let index = 0;

    for (; index < max; index++) {
      const routeSegment = routeSegments[index];
      const uriSegment = uriSegments[index];

      if (routeSegment !== undefined && isSplat(routeSegment)) {
        // Hit a splat, just grab the rest, and return a match
        // uri:   /files/documents/work
        // route: /files/* or /files/*splatname
        const splatName = routeSegment === "*" ? "*" : routeSegment.slice(1);

        params[splatName] = uriSegments
          .slice(index)
          .map(decodeURIComponent)
          .join("/");
        break;
      }

      if (uriSegment === undefined) {
        // URI is shorter than the route, no match
        // uri:   /users
        // route: /users/:userId
        missed = true;
        break;
      }

      let dynamicMatch = paramRe.exec(routeSegment);

      if (dynamicMatch && !isRootUri) {
        const value = decodeURIComponent(uriSegment);
        params[dynamicMatch[1]] = value;
      } else if (routeSegment !== uriSegment) {
        // Current segments don't match, not dynamic, not splat, so no match
        // uri:   /users/123/settings
        // route: /users/:id/profile
        missed = true;
        break;
      }
    }

    if (!missed) {
      match = {
        route,
        params,
        uri: "/" + uriSegments.slice(0, index).join("/")
      };
      break;
    }
  }

  return match || default_ || null;
}

/**
 * Check if the `path` matches the `uri`.
 * @param {string} path
 * @param {string} uri
 * @return {?object}
 */
function match(route, uri) {
  return pick([route], uri);
}

/**
 * Combines the `basepath` and the `path` into one path.
 * @param {string} basepath
 * @param {string} path
 */
function combinePaths(basepath, path) {
  return `${stripSlashes(
    path === "/" ? basepath : `${stripSlashes(basepath)}/${stripSlashes(path)}`
  )}/`;
}

/* node_modules/svelte-routing/src/Router.svelte generated by Svelte v3.29.4 */

const Router = create_ssr_component(($$result, $$props, $$bindings, slots) => {
	let $base;
	let $location;
	let $routes;
	let { basepath = "/" } = $$props;
	let { url = null } = $$props;
	const locationContext = getContext(LOCATION);
	const routerContext = getContext(ROUTER);
	const routes = writable([]);
	$routes = get_store_value(routes);
	const activeRoute = writable(null);
	let hasActiveRoute = false; // Used in SSR to synchronously set that a Route is active.

	// If locationContext is not set, this is the topmost Router in the tree.
	// If the `url` prop is given we force the location to it.
	const location = locationContext || writable(url ? { pathname: url } : globalHistory.location);

	$location = get_store_value(location);

	// If routerContext is set, the routerBase of the parent Router
	// will be the base for this Router's descendants.
	// If routerContext is not set, the path and resolved uri will both
	// have the value of the basepath prop.
	const base = routerContext
	? routerContext.routerBase
	: writable({ path: basepath, uri: basepath });

	$base = get_store_value(base);

	const routerBase = derived([base, activeRoute], ([base, activeRoute]) => {
		// If there is no activeRoute, the routerBase will be identical to the base.
		if (activeRoute === null) {
			return base;
		}

		const { path: basepath } = base;
		const { route, uri } = activeRoute;

		// Remove the potential /* or /*splatname from
		// the end of the child Routes relative paths.
		const path = route.default
		? basepath
		: route.path.replace(/\*.*$/, "");

		return { path, uri };
	});

	function registerRoute(route) {
		const { path: basepath } = $base;
		let { path } = route;

		// We store the original path in the _path property so we can reuse
		// it when the basepath changes. The only thing that matters is that
		// the route reference is intact, so mutation is fine.
		route._path = path;

		route.path = combinePaths(basepath, path);

		if (typeof window === "undefined") {
			// In SSR we should set the activeRoute immediately if it is a match.
			// If there are more Routes being registered after a match is found,
			// we just skip them.
			if (hasActiveRoute) {
				return;
			}

			const matchingRoute = match(route, $location.pathname);

			if (matchingRoute) {
				activeRoute.set(matchingRoute);
				hasActiveRoute = true;
			}
		} else {
			routes.update(rs => {
				rs.push(route);
				return rs;
			});
		}
	}

	function unregisterRoute(route) {
		routes.update(rs => {
			const index = rs.indexOf(route);
			rs.splice(index, 1);
			return rs;
		});
	}

	if (!locationContext) {
		// The topmost Router in the tree is responsible for updating
		// the location store and supplying it through context.
		onMount(() => {
			const unlisten = globalHistory.listen(history => {
				location.set(history.location);
			});

			return unlisten;
		});

		setContext(LOCATION, location);
	}

	setContext(ROUTER, {
		activeRoute,
		base,
		routerBase,
		registerRoute,
		unregisterRoute
	});

	if ($$props.basepath === void 0 && $$bindings.basepath && basepath !== void 0) $$bindings.basepath(basepath);
	if ($$props.url === void 0 && $$bindings.url && url !== void 0) $$bindings.url(url);
	$base = get_store_value(base);
	$location = get_store_value(location);
	$routes = get_store_value(routes);

	 {
		{
			const { path: basepath } = $base;

			routes.update(rs => {
				rs.forEach(r => r.path = combinePaths(basepath, r._path));
				return rs;
			});
		}
	}

	 {
		{
			const bestMatch = pick($routes, $location.pathname);
			activeRoute.set(bestMatch);
		}
	}

	return `${slots.default ? slots.default({}) : ``}`;
});

/* node_modules/svelte-routing/src/Route.svelte generated by Svelte v3.29.4 */

const Route = create_ssr_component(($$result, $$props, $$bindings, slots) => {
	let $activeRoute;
	let $location;
	let { path = "" } = $$props;
	let { component = null } = $$props;
	const { registerRoute, unregisterRoute, activeRoute } = getContext(ROUTER);
	$activeRoute = get_store_value(activeRoute);
	const location = getContext(LOCATION);
	$location = get_store_value(location);

	const route = {
		path,
		// If no path prop is given, this Route will act as the default Route
		// that is rendered if no other Route in the Router is a match.
		default: path === ""
	};

	let routeParams = {};
	let routeProps = {};
	registerRoute(route);

	// There is no need to unregister Routes in SSR since it will all be
	// thrown away anyway.
	if (typeof window !== "undefined") {
		onDestroy(() => {
			unregisterRoute(route);
		});
	}

	if ($$props.path === void 0 && $$bindings.path && path !== void 0) $$bindings.path(path);
	if ($$props.component === void 0 && $$bindings.component && component !== void 0) $$bindings.component(component);
	$activeRoute = get_store_value(activeRoute);
	$location = get_store_value(location);

	 {
		if ($activeRoute && $activeRoute.route === route) {
			routeParams = $activeRoute.params;
		}
	}

	 {
		{
			const { path, component, ...rest } = $$props;
			routeProps = rest;
		}
	}

	return `${$activeRoute !== null && $activeRoute.route === route
	? `${component !== null
		? `${validate_component(component || missing_component, "svelte:component").$$render($$result, Object.assign({ location: $location }, routeParams, routeProps), {}, {})}`
		: `${slots.default
			? slots.default({ params: routeParams, location: $location })
			: ``}`}`
	: ``}`;
});

/* src/routes/Admin.svelte generated by Svelte v3.29.4 */

const Admin = create_ssr_component(($$result, $$props, $$bindings, slots) => {
	return `<main><h1>Admin</h1></main>`;
});

/* src/routes/Home.svelte generated by Svelte v3.29.4 */

const css = {
	code: ".titleContainer.svelte-1a39zoq{background-image:linear-gradient(\n      45deg,\n      rgb(18, 26, 58) 0%,\n      rgb(39, 9, 55) 100%\n    );height:30rem;display:flex;justify-content:center;align-items:center}h1.svelte-1a39zoq{font-family:'Rye';font-size:6rem;color:#ffde59;text-align:center}.mainContainer.svelte-1a39zoq{margin:-60px 30px 0;border-radius:6px;box-shadow:0 16px 24px 2px rgba(0, 0, 0, 0.14),\n      0 6px 30px 5px rgba(0, 0, 0, 0.12), 0 8px 10px -5px rgba(0, 0, 0, 0.2);background-color:#fff;background-size:contain;margin-bottom:50px;padding-bottom:50px;display:flex;flex-direction:column;align-items:center;box-sizing:content-box}h2.svelte-1a39zoq{font-family:'Rye';font-size:3rem;padding-top:40px;text-align:center}form.svelte-1a39zoq{font-family:'Abhaya Libre';display:flex;flex-direction:column;padding:50px;font-size:2rem;border-top:2px solid rgba(39, 9, 55, 0.5)}select.svelte-1a39zoq{font-size:2rem;margin:15px;border:2px solid rgb(39, 9, 55);border-radius:10px;padding:5px;background-color:#fff;font-family:'Abhaya Libre';appearance:none;-webkit-appearance:none;-moz-appearance:none;cursor:pointer}.ticket.svelte-1a39zoq{display:flex}input.svelte-1a39zoq{font-size:2rem;margin:15px;border:2px solid rgb(39, 9, 55);border-radius:10px;padding:5px;font-family:'Abhaya Libre';transition:all 250ms}input.svelte-1a39zoq:hover,input.svelte-1a39zoq:focus,select.svelte-1a39zoq:hover,select.svelte-1a39zoq:focus{border-color:#ffde59;border-radius:10px}button.svelte-1a39zoq{border:2px solid rgb(39, 9, 55);border-radius:10px;padding:10px;font-size:2.5rem;margin-top:20px;font-family:'Abhaya Libre';font-weight:bold;background-color:rgb(39, 9, 55);color:#ffde59;cursor:pointer}",
	map: "{\"version\":3,\"file\":\"Home.svelte\",\"sources\":[\"Home.svelte\"],\"sourcesContent\":[\"<script>\\n  import { onMount } from 'svelte';\\n  const categories = ['Spectateur', 'Artiste'];\\n  const artists = [];\\n\\n  let ticketDirection;\\n\\n  onMount(() => {\\n    ticketDirection = window.innerHeight > window.innerWidth ? 'column' : 'row';\\n  });\\n</script>\\n\\n<style>\\n  .titleContainer {\\n    background-image: linear-gradient(\\n      45deg,\\n      rgb(18, 26, 58) 0%,\\n      rgb(39, 9, 55) 100%\\n    );\\n    height: 30rem;\\n    display: flex;\\n    justify-content: center;\\n    align-items: center;\\n  }\\n\\n  h1 {\\n    font-family: 'Rye';\\n    font-size: 6rem;\\n    color: #ffde59;\\n    text-align: center;\\n  }\\n\\n  .mainContainer {\\n    margin: -60px 30px 0;\\n    border-radius: 6px;\\n    box-shadow: 0 16px 24px 2px rgba(0, 0, 0, 0.14),\\n      0 6px 30px 5px rgba(0, 0, 0, 0.12), 0 8px 10px -5px rgba(0, 0, 0, 0.2);\\n    /* background: url('/assets/lion.png') no-repeat center; */\\n    background-color: #fff;\\n    background-size: contain;\\n    margin-bottom: 50px;\\n    padding-bottom: 50px;\\n    display: flex;\\n    flex-direction: column;\\n    align-items: center;\\n    box-sizing: content-box;\\n  }\\n\\n  h2 {\\n    font-family: 'Rye';\\n    font-size: 3rem;\\n    padding-top: 40px;\\n    text-align: center;\\n  }\\n\\n  form {\\n    font-family: 'Abhaya Libre';\\n    display: flex;\\n    flex-direction: column;\\n    padding: 50px;\\n    font-size: 2rem;\\n    border-top: 2px solid rgba(39, 9, 55, 0.5);\\n  }\\n\\n  select {\\n    font-size: 2rem;\\n    margin: 15px;\\n    border: 2px solid rgb(39, 9, 55);\\n    border-radius: 10px;\\n    padding: 5px;\\n    background-color: #fff;\\n    font-family: 'Abhaya Libre';\\n    appearance: none;\\n    -webkit-appearance: none;\\n    -moz-appearance: none;\\n    cursor: pointer;\\n  }\\n\\n  .ticket {\\n    display: flex;\\n  }\\n\\n  input {\\n    font-size: 2rem;\\n    margin: 15px;\\n    border: 2px solid rgb(39, 9, 55);\\n    border-radius: 10px;\\n    padding: 5px;\\n    font-family: 'Abhaya Libre';\\n    transition: all 250ms;\\n  }\\n\\n  input:hover,\\n  input:focus,\\n  select:hover,\\n  select:focus {\\n    border-color: #ffde59;\\n    border-radius: 10px;\\n  }\\n\\n  button {\\n    border: 2px solid rgb(39, 9, 55);\\n    border-radius: 10px;\\n    padding: 10px;\\n    font-size: 2.5rem;\\n    margin-top: 20px;\\n    font-family: 'Abhaya Libre';\\n    font-weight: bold;\\n    background-color: rgb(39, 9, 55);\\n    color: #ffde59;\\n    cursor: pointer;\\n  }\\n</style>\\n\\n<main>\\n  <div class=\\\"titleContainer\\\">\\n    <h1>Talents du Nord</h1>\\n  </div>\\n\\n  <div class=\\\"mainContainer\\\">\\n    <h2>TDN-12 Novembre 2020</h2>\\n    <form>\\n      <div class=\\\"ticket\\\" style=\\\"flex-direction: {ticketDirection}\\\">\\n        <label for=\\\"ticketRole\\\">Catégorie</label>\\n        <select name=\\\"ticketRole\\\" id=\\\"ticketRole\\\">\\n          {#each categories as categorie}\\n            <option value={categorie}>{categorie}</option>\\n          {/each}\\n        </select>\\n\\n        <label for=\\\"ticketNumber\\\">N° de place</label>\\n        <input name=\\\"ticketNumber\\\" id=\\\"ticketNumber\\\" type=\\\"number\\\" />\\n      </div>\\n\\n      <label for=\\\"vote\\\">N° du gagnant</label>\\n      <select name=\\\"vote\\\" id=\\\"vote\\\">\\n        {#each artists as artist}\\n          <option value={artist}>{artist}</option>\\n        {/each}\\n      </select>\\n\\n      <button type=\\\"submit\\\">Voter</button>\\n    </form>\\n  </div>\\n</main>\\n\"],\"names\":[],\"mappings\":\"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\"}"
};

const Home = create_ssr_component(($$result, $$props, $$bindings, slots) => {
	const categories = ["Spectateur", "Artiste"];
	const artists = [];
	let ticketDirection;

	onMount(() => {
		ticketDirection = window.innerHeight > window.innerWidth
		? "column"
		: "row";
	});

	$$result.css.add(css);

	return `<main><div class="${"titleContainer svelte-1a39zoq"}"><h1 class="${"svelte-1a39zoq"}">Talents du Nord</h1></div>

  <div class="${"mainContainer svelte-1a39zoq"}"><h2 class="${"svelte-1a39zoq"}">TDN-12 Novembre 2020</h2>
    <form class="${"svelte-1a39zoq"}"><div class="${"ticket svelte-1a39zoq"}" style="${"flex-direction: " + escape(ticketDirection)}"><label for="${"ticketRole"}">Catégorie</label>
        <select name="${"ticketRole"}" id="${"ticketRole"}" class="${"svelte-1a39zoq"}">${each(categories, categorie => `<option${add_attribute("value", categorie, 0)}>${escape(categorie)}</option>`)}</select>

        <label for="${"ticketNumber"}">N° de place</label>
        <input name="${"ticketNumber"}" id="${"ticketNumber"}" type="${"number"}" class="${"svelte-1a39zoq"}"></div>

      <label for="${"vote"}">N° du gagnant</label>
      <select name="${"vote"}" id="${"vote"}" class="${"svelte-1a39zoq"}">${each(artists, artist => `<option${add_attribute("value", artist, 0)}>${escape(artist)}</option>`)}</select>

      <button type="${"submit"}" class="${"svelte-1a39zoq"}">Voter</button></form></div></main>`;
});

/* src/routes/Login.svelte generated by Svelte v3.29.4 */

const Login = create_ssr_component(($$result, $$props, $$bindings, slots) => {
	return `<main><h1>Login</h1></main>`;
});

/* src/App.svelte generated by Svelte v3.29.4 */

const App = create_ssr_component(($$result, $$props, $$bindings, slots) => {
	let { url = "" } = $$props;
	if ($$props.url === void 0 && $$bindings.url && url !== void 0) $$bindings.url(url);

	return `${validate_component(Router, "Router").$$render($$result, { url }, {}, {
		default: () => `${validate_component(Route, "Route").$$render($$result, { path: "login", component: Login }, {}, {})}
  ${validate_component(Route, "Route").$$render($$result, { path: "admin", component: Admin }, {}, {})}
  ${validate_component(Route, "Route").$$render($$result, { path: "/", component: Home }, {}, {})}`
	})}`;
});

module.exports = App;
