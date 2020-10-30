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

var bind = function bind(fn, thisArg) {
  return function wrap() {
    var args = new Array(arguments.length);
    for (var i = 0; i < args.length; i++) {
      args[i] = arguments[i];
    }
    return fn.apply(thisArg, args);
  };
};

/*global toString:true*/

// utils is a library of generic helper functions non-specific to axios

var toString = Object.prototype.toString;

/**
 * Determine if a value is an Array
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is an Array, otherwise false
 */
function isArray(val) {
  return toString.call(val) === '[object Array]';
}

/**
 * Determine if a value is undefined
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if the value is undefined, otherwise false
 */
function isUndefined(val) {
  return typeof val === 'undefined';
}

/**
 * Determine if a value is a Buffer
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Buffer, otherwise false
 */
function isBuffer(val) {
  return val !== null && !isUndefined(val) && val.constructor !== null && !isUndefined(val.constructor)
    && typeof val.constructor.isBuffer === 'function' && val.constructor.isBuffer(val);
}

/**
 * Determine if a value is an ArrayBuffer
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is an ArrayBuffer, otherwise false
 */
function isArrayBuffer(val) {
  return toString.call(val) === '[object ArrayBuffer]';
}

/**
 * Determine if a value is a FormData
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is an FormData, otherwise false
 */
function isFormData(val) {
  return (typeof FormData !== 'undefined') && (val instanceof FormData);
}

/**
 * Determine if a value is a view on an ArrayBuffer
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a view on an ArrayBuffer, otherwise false
 */
function isArrayBufferView(val) {
  var result;
  if ((typeof ArrayBuffer !== 'undefined') && (ArrayBuffer.isView)) {
    result = ArrayBuffer.isView(val);
  } else {
    result = (val) && (val.buffer) && (val.buffer instanceof ArrayBuffer);
  }
  return result;
}

/**
 * Determine if a value is a String
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a String, otherwise false
 */
function isString(val) {
  return typeof val === 'string';
}

/**
 * Determine if a value is a Number
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Number, otherwise false
 */
function isNumber(val) {
  return typeof val === 'number';
}

/**
 * Determine if a value is an Object
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is an Object, otherwise false
 */
function isObject(val) {
  return val !== null && typeof val === 'object';
}

/**
 * Determine if a value is a plain Object
 *
 * @param {Object} val The value to test
 * @return {boolean} True if value is a plain Object, otherwise false
 */
function isPlainObject(val) {
  if (toString.call(val) !== '[object Object]') {
    return false;
  }

  var prototype = Object.getPrototypeOf(val);
  return prototype === null || prototype === Object.prototype;
}

/**
 * Determine if a value is a Date
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Date, otherwise false
 */
function isDate(val) {
  return toString.call(val) === '[object Date]';
}

/**
 * Determine if a value is a File
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a File, otherwise false
 */
function isFile(val) {
  return toString.call(val) === '[object File]';
}

/**
 * Determine if a value is a Blob
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Blob, otherwise false
 */
function isBlob(val) {
  return toString.call(val) === '[object Blob]';
}

/**
 * Determine if a value is a Function
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Function, otherwise false
 */
function isFunction(val) {
  return toString.call(val) === '[object Function]';
}

/**
 * Determine if a value is a Stream
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Stream, otherwise false
 */
function isStream(val) {
  return isObject(val) && isFunction(val.pipe);
}

/**
 * Determine if a value is a URLSearchParams object
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a URLSearchParams object, otherwise false
 */
function isURLSearchParams(val) {
  return typeof URLSearchParams !== 'undefined' && val instanceof URLSearchParams;
}

/**
 * Trim excess whitespace off the beginning and end of a string
 *
 * @param {String} str The String to trim
 * @returns {String} The String freed of excess whitespace
 */
function trim(str) {
  return str.replace(/^\s*/, '').replace(/\s*$/, '');
}

/**
 * Determine if we're running in a standard browser environment
 *
 * This allows axios to run in a web worker, and react-native.
 * Both environments support XMLHttpRequest, but not fully standard globals.
 *
 * web workers:
 *  typeof window -> undefined
 *  typeof document -> undefined
 *
 * react-native:
 *  navigator.product -> 'ReactNative'
 * nativescript
 *  navigator.product -> 'NativeScript' or 'NS'
 */
function isStandardBrowserEnv() {
  if (typeof navigator !== 'undefined' && (navigator.product === 'ReactNative' ||
                                           navigator.product === 'NativeScript' ||
                                           navigator.product === 'NS')) {
    return false;
  }
  return (
    typeof window !== 'undefined' &&
    typeof document !== 'undefined'
  );
}

/**
 * Iterate over an Array or an Object invoking a function for each item.
 *
 * If `obj` is an Array callback will be called passing
 * the value, index, and complete array for each item.
 *
 * If 'obj' is an Object callback will be called passing
 * the value, key, and complete object for each property.
 *
 * @param {Object|Array} obj The object to iterate
 * @param {Function} fn The callback to invoke for each item
 */
function forEach(obj, fn) {
  // Don't bother if no value provided
  if (obj === null || typeof obj === 'undefined') {
    return;
  }

  // Force an array if not already something iterable
  if (typeof obj !== 'object') {
    /*eslint no-param-reassign:0*/
    obj = [obj];
  }

  if (isArray(obj)) {
    // Iterate over array values
    for (var i = 0, l = obj.length; i < l; i++) {
      fn.call(null, obj[i], i, obj);
    }
  } else {
    // Iterate over object keys
    for (var key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        fn.call(null, obj[key], key, obj);
      }
    }
  }
}

/**
 * Accepts varargs expecting each argument to be an object, then
 * immutably merges the properties of each object and returns result.
 *
 * When multiple objects contain the same key the later object in
 * the arguments list will take precedence.
 *
 * Example:
 *
 * ```js
 * var result = merge({foo: 123}, {foo: 456});
 * console.log(result.foo); // outputs 456
 * ```
 *
 * @param {Object} obj1 Object to merge
 * @returns {Object} Result of all merge properties
 */
function merge(/* obj1, obj2, obj3, ... */) {
  var result = {};
  function assignValue(val, key) {
    if (isPlainObject(result[key]) && isPlainObject(val)) {
      result[key] = merge(result[key], val);
    } else if (isPlainObject(val)) {
      result[key] = merge({}, val);
    } else if (isArray(val)) {
      result[key] = val.slice();
    } else {
      result[key] = val;
    }
  }

  for (var i = 0, l = arguments.length; i < l; i++) {
    forEach(arguments[i], assignValue);
  }
  return result;
}

/**
 * Extends object a by mutably adding to it the properties of object b.
 *
 * @param {Object} a The object to be extended
 * @param {Object} b The object to copy properties from
 * @param {Object} thisArg The object to bind function to
 * @return {Object} The resulting value of object a
 */
function extend(a, b, thisArg) {
  forEach(b, function assignValue(val, key) {
    if (thisArg && typeof val === 'function') {
      a[key] = bind(val, thisArg);
    } else {
      a[key] = val;
    }
  });
  return a;
}

/**
 * Remove byte order marker. This catches EF BB BF (the UTF-8 BOM)
 *
 * @param {string} content with BOM
 * @return {string} content value without BOM
 */
function stripBOM(content) {
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }
  return content;
}

var utils = {
  isArray: isArray,
  isArrayBuffer: isArrayBuffer,
  isBuffer: isBuffer,
  isFormData: isFormData,
  isArrayBufferView: isArrayBufferView,
  isString: isString,
  isNumber: isNumber,
  isObject: isObject,
  isPlainObject: isPlainObject,
  isUndefined: isUndefined,
  isDate: isDate,
  isFile: isFile,
  isBlob: isBlob,
  isFunction: isFunction,
  isStream: isStream,
  isURLSearchParams: isURLSearchParams,
  isStandardBrowserEnv: isStandardBrowserEnv,
  forEach: forEach,
  merge: merge,
  extend: extend,
  trim: trim,
  stripBOM: stripBOM
};

function encode(val) {
  return encodeURIComponent(val).
    replace(/%3A/gi, ':').
    replace(/%24/g, '$').
    replace(/%2C/gi, ',').
    replace(/%20/g, '+').
    replace(/%5B/gi, '[').
    replace(/%5D/gi, ']');
}

/**
 * Build a URL by appending params to the end
 *
 * @param {string} url The base of the url (e.g., http://www.google.com)
 * @param {object} [params] The params to be appended
 * @returns {string} The formatted url
 */
var buildURL = function buildURL(url, params, paramsSerializer) {
  /*eslint no-param-reassign:0*/
  if (!params) {
    return url;
  }

  var serializedParams;
  if (paramsSerializer) {
    serializedParams = paramsSerializer(params);
  } else if (utils.isURLSearchParams(params)) {
    serializedParams = params.toString();
  } else {
    var parts = [];

    utils.forEach(params, function serialize(val, key) {
      if (val === null || typeof val === 'undefined') {
        return;
      }

      if (utils.isArray(val)) {
        key = key + '[]';
      } else {
        val = [val];
      }

      utils.forEach(val, function parseValue(v) {
        if (utils.isDate(v)) {
          v = v.toISOString();
        } else if (utils.isObject(v)) {
          v = JSON.stringify(v);
        }
        parts.push(encode(key) + '=' + encode(v));
      });
    });

    serializedParams = parts.join('&');
  }

  if (serializedParams) {
    var hashmarkIndex = url.indexOf('#');
    if (hashmarkIndex !== -1) {
      url = url.slice(0, hashmarkIndex);
    }

    url += (url.indexOf('?') === -1 ? '?' : '&') + serializedParams;
  }

  return url;
};

function InterceptorManager() {
  this.handlers = [];
}

/**
 * Add a new interceptor to the stack
 *
 * @param {Function} fulfilled The function to handle `then` for a `Promise`
 * @param {Function} rejected The function to handle `reject` for a `Promise`
 *
 * @return {Number} An ID used to remove interceptor later
 */
InterceptorManager.prototype.use = function use(fulfilled, rejected) {
  this.handlers.push({
    fulfilled: fulfilled,
    rejected: rejected
  });
  return this.handlers.length - 1;
};

/**
 * Remove an interceptor from the stack
 *
 * @param {Number} id The ID that was returned by `use`
 */
InterceptorManager.prototype.eject = function eject(id) {
  if (this.handlers[id]) {
    this.handlers[id] = null;
  }
};

/**
 * Iterate over all the registered interceptors
 *
 * This method is particularly useful for skipping over any
 * interceptors that may have become `null` calling `eject`.
 *
 * @param {Function} fn The function to call for each interceptor
 */
InterceptorManager.prototype.forEach = function forEach(fn) {
  utils.forEach(this.handlers, function forEachHandler(h) {
    if (h !== null) {
      fn(h);
    }
  });
};

var InterceptorManager_1 = InterceptorManager;

/**
 * Transform the data for a request or a response
 *
 * @param {Object|String} data The data to be transformed
 * @param {Array} headers The headers for the request or response
 * @param {Array|Function} fns A single function or Array of functions
 * @returns {*} The resulting transformed data
 */
var transformData = function transformData(data, headers, fns) {
  /*eslint no-param-reassign:0*/
  utils.forEach(fns, function transform(fn) {
    data = fn(data, headers);
  });

  return data;
};

var isCancel = function isCancel(value) {
  return !!(value && value.__CANCEL__);
};

var normalizeHeaderName = function normalizeHeaderName(headers, normalizedName) {
  utils.forEach(headers, function processHeader(value, name) {
    if (name !== normalizedName && name.toUpperCase() === normalizedName.toUpperCase()) {
      headers[normalizedName] = value;
      delete headers[name];
    }
  });
};

/**
 * Update an Error with the specified config, error code, and response.
 *
 * @param {Error} error The error to update.
 * @param {Object} config The config.
 * @param {string} [code] The error code (for example, 'ECONNABORTED').
 * @param {Object} [request] The request.
 * @param {Object} [response] The response.
 * @returns {Error} The error.
 */
var enhanceError = function enhanceError(error, config, code, request, response) {
  error.config = config;
  if (code) {
    error.code = code;
  }

  error.request = request;
  error.response = response;
  error.isAxiosError = true;

  error.toJSON = function toJSON() {
    return {
      // Standard
      message: this.message,
      name: this.name,
      // Microsoft
      description: this.description,
      number: this.number,
      // Mozilla
      fileName: this.fileName,
      lineNumber: this.lineNumber,
      columnNumber: this.columnNumber,
      stack: this.stack,
      // Axios
      config: this.config,
      code: this.code
    };
  };
  return error;
};

/**
 * Create an Error with the specified message, config, error code, request and response.
 *
 * @param {string} message The error message.
 * @param {Object} config The config.
 * @param {string} [code] The error code (for example, 'ECONNABORTED').
 * @param {Object} [request] The request.
 * @param {Object} [response] The response.
 * @returns {Error} The created error.
 */
var createError = function createError(message, config, code, request, response) {
  var error = new Error(message);
  return enhanceError(error, config, code, request, response);
};

/**
 * Resolve or reject a Promise based on response status.
 *
 * @param {Function} resolve A function that resolves the promise.
 * @param {Function} reject A function that rejects the promise.
 * @param {object} response The response.
 */
var settle = function settle(resolve, reject, response) {
  var validateStatus = response.config.validateStatus;
  if (!response.status || !validateStatus || validateStatus(response.status)) {
    resolve(response);
  } else {
    reject(createError(
      'Request failed with status code ' + response.status,
      response.config,
      null,
      response.request,
      response
    ));
  }
};

var cookies = (
  utils.isStandardBrowserEnv() ?

  // Standard browser envs support document.cookie
    (function standardBrowserEnv() {
      return {
        write: function write(name, value, expires, path, domain, secure) {
          var cookie = [];
          cookie.push(name + '=' + encodeURIComponent(value));

          if (utils.isNumber(expires)) {
            cookie.push('expires=' + new Date(expires).toGMTString());
          }

          if (utils.isString(path)) {
            cookie.push('path=' + path);
          }

          if (utils.isString(domain)) {
            cookie.push('domain=' + domain);
          }

          if (secure === true) {
            cookie.push('secure');
          }

          document.cookie = cookie.join('; ');
        },

        read: function read(name) {
          var match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
          return (match ? decodeURIComponent(match[3]) : null);
        },

        remove: function remove(name) {
          this.write(name, '', Date.now() - 86400000);
        }
      };
    })() :

  // Non standard browser env (web workers, react-native) lack needed support.
    (function nonStandardBrowserEnv() {
      return {
        write: function write() {},
        read: function read() { return null; },
        remove: function remove() {}
      };
    })()
);

/**
 * Determines whether the specified URL is absolute
 *
 * @param {string} url The URL to test
 * @returns {boolean} True if the specified URL is absolute, otherwise false
 */
var isAbsoluteURL = function isAbsoluteURL(url) {
  // A URL is considered absolute if it begins with "<scheme>://" or "//" (protocol-relative URL).
  // RFC 3986 defines scheme name as a sequence of characters beginning with a letter and followed
  // by any combination of letters, digits, plus, period, or hyphen.
  return /^([a-z][a-z\d\+\-\.]*:)?\/\//i.test(url);
};

/**
 * Creates a new URL by combining the specified URLs
 *
 * @param {string} baseURL The base URL
 * @param {string} relativeURL The relative URL
 * @returns {string} The combined URL
 */
var combineURLs = function combineURLs(baseURL, relativeURL) {
  return relativeURL
    ? baseURL.replace(/\/+$/, '') + '/' + relativeURL.replace(/^\/+/, '')
    : baseURL;
};

/**
 * Creates a new URL by combining the baseURL with the requestedURL,
 * only when the requestedURL is not already an absolute URL.
 * If the requestURL is absolute, this function returns the requestedURL untouched.
 *
 * @param {string} baseURL The base URL
 * @param {string} requestedURL Absolute or relative URL to combine
 * @returns {string} The combined full path
 */
var buildFullPath = function buildFullPath(baseURL, requestedURL) {
  if (baseURL && !isAbsoluteURL(requestedURL)) {
    return combineURLs(baseURL, requestedURL);
  }
  return requestedURL;
};

// Headers whose duplicates are ignored by node
// c.f. https://nodejs.org/api/http.html#http_message_headers
var ignoreDuplicateOf = [
  'age', 'authorization', 'content-length', 'content-type', 'etag',
  'expires', 'from', 'host', 'if-modified-since', 'if-unmodified-since',
  'last-modified', 'location', 'max-forwards', 'proxy-authorization',
  'referer', 'retry-after', 'user-agent'
];

/**
 * Parse headers into an object
 *
 * ```
 * Date: Wed, 27 Aug 2014 08:58:49 GMT
 * Content-Type: application/json
 * Connection: keep-alive
 * Transfer-Encoding: chunked
 * ```
 *
 * @param {String} headers Headers needing to be parsed
 * @returns {Object} Headers parsed into an object
 */
var parseHeaders = function parseHeaders(headers) {
  var parsed = {};
  var key;
  var val;
  var i;

  if (!headers) { return parsed; }

  utils.forEach(headers.split('\n'), function parser(line) {
    i = line.indexOf(':');
    key = utils.trim(line.substr(0, i)).toLowerCase();
    val = utils.trim(line.substr(i + 1));

    if (key) {
      if (parsed[key] && ignoreDuplicateOf.indexOf(key) >= 0) {
        return;
      }
      if (key === 'set-cookie') {
        parsed[key] = (parsed[key] ? parsed[key] : []).concat([val]);
      } else {
        parsed[key] = parsed[key] ? parsed[key] + ', ' + val : val;
      }
    }
  });

  return parsed;
};

var isURLSameOrigin = (
  utils.isStandardBrowserEnv() ?

  // Standard browser envs have full support of the APIs needed to test
  // whether the request URL is of the same origin as current location.
    (function standardBrowserEnv() {
      var msie = /(msie|trident)/i.test(navigator.userAgent);
      var urlParsingNode = document.createElement('a');
      var originURL;

      /**
    * Parse a URL to discover it's components
    *
    * @param {String} url The URL to be parsed
    * @returns {Object}
    */
      function resolveURL(url) {
        var href = url;

        if (msie) {
        // IE needs attribute set twice to normalize properties
          urlParsingNode.setAttribute('href', href);
          href = urlParsingNode.href;
        }

        urlParsingNode.setAttribute('href', href);

        // urlParsingNode provides the UrlUtils interface - http://url.spec.whatwg.org/#urlutils
        return {
          href: urlParsingNode.href,
          protocol: urlParsingNode.protocol ? urlParsingNode.protocol.replace(/:$/, '') : '',
          host: urlParsingNode.host,
          search: urlParsingNode.search ? urlParsingNode.search.replace(/^\?/, '') : '',
          hash: urlParsingNode.hash ? urlParsingNode.hash.replace(/^#/, '') : '',
          hostname: urlParsingNode.hostname,
          port: urlParsingNode.port,
          pathname: (urlParsingNode.pathname.charAt(0) === '/') ?
            urlParsingNode.pathname :
            '/' + urlParsingNode.pathname
        };
      }

      originURL = resolveURL(window.location.href);

      /**
    * Determine if a URL shares the same origin as the current location
    *
    * @param {String} requestURL The URL to test
    * @returns {boolean} True if URL shares the same origin, otherwise false
    */
      return function isURLSameOrigin(requestURL) {
        var parsed = (utils.isString(requestURL)) ? resolveURL(requestURL) : requestURL;
        return (parsed.protocol === originURL.protocol &&
            parsed.host === originURL.host);
      };
    })() :

  // Non standard browser envs (web workers, react-native) lack needed support.
    (function nonStandardBrowserEnv() {
      return function isURLSameOrigin() {
        return true;
      };
    })()
);

var xhr = function xhrAdapter(config) {
  return new Promise(function dispatchXhrRequest(resolve, reject) {
    var requestData = config.data;
    var requestHeaders = config.headers;

    if (utils.isFormData(requestData)) {
      delete requestHeaders['Content-Type']; // Let the browser set it
    }

    var request = new XMLHttpRequest();

    // HTTP basic authentication
    if (config.auth) {
      var username = config.auth.username || '';
      var password = config.auth.password ? unescape(encodeURIComponent(config.auth.password)) : '';
      requestHeaders.Authorization = 'Basic ' + btoa(username + ':' + password);
    }

    var fullPath = buildFullPath(config.baseURL, config.url);
    request.open(config.method.toUpperCase(), buildURL(fullPath, config.params, config.paramsSerializer), true);

    // Set the request timeout in MS
    request.timeout = config.timeout;

    // Listen for ready state
    request.onreadystatechange = function handleLoad() {
      if (!request || request.readyState !== 4) {
        return;
      }

      // The request errored out and we didn't get a response, this will be
      // handled by onerror instead
      // With one exception: request that using file: protocol, most browsers
      // will return status as 0 even though it's a successful request
      if (request.status === 0 && !(request.responseURL && request.responseURL.indexOf('file:') === 0)) {
        return;
      }

      // Prepare the response
      var responseHeaders = 'getAllResponseHeaders' in request ? parseHeaders(request.getAllResponseHeaders()) : null;
      var responseData = !config.responseType || config.responseType === 'text' ? request.responseText : request.response;
      var response = {
        data: responseData,
        status: request.status,
        statusText: request.statusText,
        headers: responseHeaders,
        config: config,
        request: request
      };

      settle(resolve, reject, response);

      // Clean up request
      request = null;
    };

    // Handle browser request cancellation (as opposed to a manual cancellation)
    request.onabort = function handleAbort() {
      if (!request) {
        return;
      }

      reject(createError('Request aborted', config, 'ECONNABORTED', request));

      // Clean up request
      request = null;
    };

    // Handle low level network errors
    request.onerror = function handleError() {
      // Real errors are hidden from us by the browser
      // onerror should only fire if it's a network error
      reject(createError('Network Error', config, null, request));

      // Clean up request
      request = null;
    };

    // Handle timeout
    request.ontimeout = function handleTimeout() {
      var timeoutErrorMessage = 'timeout of ' + config.timeout + 'ms exceeded';
      if (config.timeoutErrorMessage) {
        timeoutErrorMessage = config.timeoutErrorMessage;
      }
      reject(createError(timeoutErrorMessage, config, 'ECONNABORTED',
        request));

      // Clean up request
      request = null;
    };

    // Add xsrf header
    // This is only done if running in a standard browser environment.
    // Specifically not if we're in a web worker, or react-native.
    if (utils.isStandardBrowserEnv()) {
      // Add xsrf header
      var xsrfValue = (config.withCredentials || isURLSameOrigin(fullPath)) && config.xsrfCookieName ?
        cookies.read(config.xsrfCookieName) :
        undefined;

      if (xsrfValue) {
        requestHeaders[config.xsrfHeaderName] = xsrfValue;
      }
    }

    // Add headers to the request
    if ('setRequestHeader' in request) {
      utils.forEach(requestHeaders, function setRequestHeader(val, key) {
        if (typeof requestData === 'undefined' && key.toLowerCase() === 'content-type') {
          // Remove Content-Type if data is undefined
          delete requestHeaders[key];
        } else {
          // Otherwise add header to the request
          request.setRequestHeader(key, val);
        }
      });
    }

    // Add withCredentials to request if needed
    if (!utils.isUndefined(config.withCredentials)) {
      request.withCredentials = !!config.withCredentials;
    }

    // Add responseType to request if needed
    if (config.responseType) {
      try {
        request.responseType = config.responseType;
      } catch (e) {
        // Expected DOMException thrown by browsers not compatible XMLHttpRequest Level 2.
        // But, this can be suppressed for 'json' type as it can be parsed by default 'transformResponse' function.
        if (config.responseType !== 'json') {
          throw e;
        }
      }
    }

    // Handle progress if needed
    if (typeof config.onDownloadProgress === 'function') {
      request.addEventListener('progress', config.onDownloadProgress);
    }

    // Not all browsers support upload events
    if (typeof config.onUploadProgress === 'function' && request.upload) {
      request.upload.addEventListener('progress', config.onUploadProgress);
    }

    if (config.cancelToken) {
      // Handle cancellation
      config.cancelToken.promise.then(function onCanceled(cancel) {
        if (!request) {
          return;
        }

        request.abort();
        reject(cancel);
        // Clean up request
        request = null;
      });
    }

    if (!requestData) {
      requestData = null;
    }

    // Send the request
    request.send(requestData);
  });
};

var DEFAULT_CONTENT_TYPE = {
  'Content-Type': 'application/x-www-form-urlencoded'
};

function setContentTypeIfUnset(headers, value) {
  if (!utils.isUndefined(headers) && utils.isUndefined(headers['Content-Type'])) {
    headers['Content-Type'] = value;
  }
}

function getDefaultAdapter() {
  var adapter;
  if (typeof XMLHttpRequest !== 'undefined') {
    // For browsers use XHR adapter
    adapter = xhr;
  } else if (typeof process !== 'undefined' && Object.prototype.toString.call(process) === '[object process]') {
    // For node use HTTP adapter
    adapter = xhr;
  }
  return adapter;
}

var defaults = {
  adapter: getDefaultAdapter(),

  transformRequest: [function transformRequest(data, headers) {
    normalizeHeaderName(headers, 'Accept');
    normalizeHeaderName(headers, 'Content-Type');
    if (utils.isFormData(data) ||
      utils.isArrayBuffer(data) ||
      utils.isBuffer(data) ||
      utils.isStream(data) ||
      utils.isFile(data) ||
      utils.isBlob(data)
    ) {
      return data;
    }
    if (utils.isArrayBufferView(data)) {
      return data.buffer;
    }
    if (utils.isURLSearchParams(data)) {
      setContentTypeIfUnset(headers, 'application/x-www-form-urlencoded;charset=utf-8');
      return data.toString();
    }
    if (utils.isObject(data)) {
      setContentTypeIfUnset(headers, 'application/json;charset=utf-8');
      return JSON.stringify(data);
    }
    return data;
  }],

  transformResponse: [function transformResponse(data) {
    /*eslint no-param-reassign:0*/
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (e) { /* Ignore */ }
    }
    return data;
  }],

  /**
   * A timeout in milliseconds to abort a request. If set to 0 (default) a
   * timeout is not created.
   */
  timeout: 0,

  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN',

  maxContentLength: -1,
  maxBodyLength: -1,

  validateStatus: function validateStatus(status) {
    return status >= 200 && status < 300;
  }
};

defaults.headers = {
  common: {
    'Accept': 'application/json, text/plain, */*'
  }
};

utils.forEach(['delete', 'get', 'head'], function forEachMethodNoData(method) {
  defaults.headers[method] = {};
});

utils.forEach(['post', 'put', 'patch'], function forEachMethodWithData(method) {
  defaults.headers[method] = utils.merge(DEFAULT_CONTENT_TYPE);
});

var defaults_1 = defaults;

/**
 * Throws a `Cancel` if cancellation has been requested.
 */
function throwIfCancellationRequested(config) {
  if (config.cancelToken) {
    config.cancelToken.throwIfRequested();
  }
}

/**
 * Dispatch a request to the server using the configured adapter.
 *
 * @param {object} config The config that is to be used for the request
 * @returns {Promise} The Promise to be fulfilled
 */
var dispatchRequest = function dispatchRequest(config) {
  throwIfCancellationRequested(config);

  // Ensure headers exist
  config.headers = config.headers || {};

  // Transform request data
  config.data = transformData(
    config.data,
    config.headers,
    config.transformRequest
  );

  // Flatten headers
  config.headers = utils.merge(
    config.headers.common || {},
    config.headers[config.method] || {},
    config.headers
  );

  utils.forEach(
    ['delete', 'get', 'head', 'post', 'put', 'patch', 'common'],
    function cleanHeaderConfig(method) {
      delete config.headers[method];
    }
  );

  var adapter = config.adapter || defaults_1.adapter;

  return adapter(config).then(function onAdapterResolution(response) {
    throwIfCancellationRequested(config);

    // Transform response data
    response.data = transformData(
      response.data,
      response.headers,
      config.transformResponse
    );

    return response;
  }, function onAdapterRejection(reason) {
    if (!isCancel(reason)) {
      throwIfCancellationRequested(config);

      // Transform response data
      if (reason && reason.response) {
        reason.response.data = transformData(
          reason.response.data,
          reason.response.headers,
          config.transformResponse
        );
      }
    }

    return Promise.reject(reason);
  });
};

/**
 * Config-specific merge-function which creates a new config-object
 * by merging two configuration objects together.
 *
 * @param {Object} config1
 * @param {Object} config2
 * @returns {Object} New object resulting from merging config2 to config1
 */
var mergeConfig = function mergeConfig(config1, config2) {
  // eslint-disable-next-line no-param-reassign
  config2 = config2 || {};
  var config = {};

  var valueFromConfig2Keys = ['url', 'method', 'data'];
  var mergeDeepPropertiesKeys = ['headers', 'auth', 'proxy', 'params'];
  var defaultToConfig2Keys = [
    'baseURL', 'transformRequest', 'transformResponse', 'paramsSerializer',
    'timeout', 'timeoutMessage', 'withCredentials', 'adapter', 'responseType', 'xsrfCookieName',
    'xsrfHeaderName', 'onUploadProgress', 'onDownloadProgress', 'decompress',
    'maxContentLength', 'maxBodyLength', 'maxRedirects', 'transport', 'httpAgent',
    'httpsAgent', 'cancelToken', 'socketPath', 'responseEncoding'
  ];
  var directMergeKeys = ['validateStatus'];

  function getMergedValue(target, source) {
    if (utils.isPlainObject(target) && utils.isPlainObject(source)) {
      return utils.merge(target, source);
    } else if (utils.isPlainObject(source)) {
      return utils.merge({}, source);
    } else if (utils.isArray(source)) {
      return source.slice();
    }
    return source;
  }

  function mergeDeepProperties(prop) {
    if (!utils.isUndefined(config2[prop])) {
      config[prop] = getMergedValue(config1[prop], config2[prop]);
    } else if (!utils.isUndefined(config1[prop])) {
      config[prop] = getMergedValue(undefined, config1[prop]);
    }
  }

  utils.forEach(valueFromConfig2Keys, function valueFromConfig2(prop) {
    if (!utils.isUndefined(config2[prop])) {
      config[prop] = getMergedValue(undefined, config2[prop]);
    }
  });

  utils.forEach(mergeDeepPropertiesKeys, mergeDeepProperties);

  utils.forEach(defaultToConfig2Keys, function defaultToConfig2(prop) {
    if (!utils.isUndefined(config2[prop])) {
      config[prop] = getMergedValue(undefined, config2[prop]);
    } else if (!utils.isUndefined(config1[prop])) {
      config[prop] = getMergedValue(undefined, config1[prop]);
    }
  });

  utils.forEach(directMergeKeys, function merge(prop) {
    if (prop in config2) {
      config[prop] = getMergedValue(config1[prop], config2[prop]);
    } else if (prop in config1) {
      config[prop] = getMergedValue(undefined, config1[prop]);
    }
  });

  var axiosKeys = valueFromConfig2Keys
    .concat(mergeDeepPropertiesKeys)
    .concat(defaultToConfig2Keys)
    .concat(directMergeKeys);

  var otherKeys = Object
    .keys(config1)
    .concat(Object.keys(config2))
    .filter(function filterAxiosKeys(key) {
      return axiosKeys.indexOf(key) === -1;
    });

  utils.forEach(otherKeys, mergeDeepProperties);

  return config;
};

/**
 * Create a new instance of Axios
 *
 * @param {Object} instanceConfig The default config for the instance
 */
function Axios(instanceConfig) {
  this.defaults = instanceConfig;
  this.interceptors = {
    request: new InterceptorManager_1(),
    response: new InterceptorManager_1()
  };
}

/**
 * Dispatch a request
 *
 * @param {Object} config The config specific for this request (merged with this.defaults)
 */
Axios.prototype.request = function request(config) {
  /*eslint no-param-reassign:0*/
  // Allow for axios('example/url'[, config]) a la fetch API
  if (typeof config === 'string') {
    config = arguments[1] || {};
    config.url = arguments[0];
  } else {
    config = config || {};
  }

  config = mergeConfig(this.defaults, config);

  // Set config.method
  if (config.method) {
    config.method = config.method.toLowerCase();
  } else if (this.defaults.method) {
    config.method = this.defaults.method.toLowerCase();
  } else {
    config.method = 'get';
  }

  // Hook up interceptors middleware
  var chain = [dispatchRequest, undefined];
  var promise = Promise.resolve(config);

  this.interceptors.request.forEach(function unshiftRequestInterceptors(interceptor) {
    chain.unshift(interceptor.fulfilled, interceptor.rejected);
  });

  this.interceptors.response.forEach(function pushResponseInterceptors(interceptor) {
    chain.push(interceptor.fulfilled, interceptor.rejected);
  });

  while (chain.length) {
    promise = promise.then(chain.shift(), chain.shift());
  }

  return promise;
};

Axios.prototype.getUri = function getUri(config) {
  config = mergeConfig(this.defaults, config);
  return buildURL(config.url, config.params, config.paramsSerializer).replace(/^\?/, '');
};

// Provide aliases for supported request methods
utils.forEach(['delete', 'get', 'head', 'options'], function forEachMethodNoData(method) {
  /*eslint func-names:0*/
  Axios.prototype[method] = function(url, config) {
    return this.request(mergeConfig(config || {}, {
      method: method,
      url: url,
      data: (config || {}).data
    }));
  };
});

utils.forEach(['post', 'put', 'patch'], function forEachMethodWithData(method) {
  /*eslint func-names:0*/
  Axios.prototype[method] = function(url, data, config) {
    return this.request(mergeConfig(config || {}, {
      method: method,
      url: url,
      data: data
    }));
  };
});

var Axios_1 = Axios;

/**
 * A `Cancel` is an object that is thrown when an operation is canceled.
 *
 * @class
 * @param {string=} message The message.
 */
function Cancel(message) {
  this.message = message;
}

Cancel.prototype.toString = function toString() {
  return 'Cancel' + (this.message ? ': ' + this.message : '');
};

Cancel.prototype.__CANCEL__ = true;

var Cancel_1 = Cancel;

/**
 * A `CancelToken` is an object that can be used to request cancellation of an operation.
 *
 * @class
 * @param {Function} executor The executor function.
 */
function CancelToken(executor) {
  if (typeof executor !== 'function') {
    throw new TypeError('executor must be a function.');
  }

  var resolvePromise;
  this.promise = new Promise(function promiseExecutor(resolve) {
    resolvePromise = resolve;
  });

  var token = this;
  executor(function cancel(message) {
    if (token.reason) {
      // Cancellation has already been requested
      return;
    }

    token.reason = new Cancel_1(message);
    resolvePromise(token.reason);
  });
}

/**
 * Throws a `Cancel` if cancellation has been requested.
 */
CancelToken.prototype.throwIfRequested = function throwIfRequested() {
  if (this.reason) {
    throw this.reason;
  }
};

/**
 * Returns an object that contains a new `CancelToken` and a function that, when called,
 * cancels the `CancelToken`.
 */
CancelToken.source = function source() {
  var cancel;
  var token = new CancelToken(function executor(c) {
    cancel = c;
  });
  return {
    token: token,
    cancel: cancel
  };
};

var CancelToken_1 = CancelToken;

/**
 * Syntactic sugar for invoking a function and expanding an array for arguments.
 *
 * Common use case would be to use `Function.prototype.apply`.
 *
 *  ```js
 *  function f(x, y, z) {}
 *  var args = [1, 2, 3];
 *  f.apply(null, args);
 *  ```
 *
 * With `spread` this example can be re-written.
 *
 *  ```js
 *  spread(function(x, y, z) {})([1, 2, 3]);
 *  ```
 *
 * @param {Function} callback
 * @returns {Function}
 */
var spread = function spread(callback) {
  return function wrap(arr) {
    return callback.apply(null, arr);
  };
};

/**
 * Create an instance of Axios
 *
 * @param {Object} defaultConfig The default config for the instance
 * @return {Axios} A new instance of Axios
 */
function createInstance(defaultConfig) {
  var context = new Axios_1(defaultConfig);
  var instance = bind(Axios_1.prototype.request, context);

  // Copy axios.prototype to instance
  utils.extend(instance, Axios_1.prototype, context);

  // Copy context to instance
  utils.extend(instance, context);

  return instance;
}

// Create the default instance to be exported
var axios = createInstance(defaults_1);

// Expose Axios class to allow class inheritance
axios.Axios = Axios_1;

// Factory for creating new instances
axios.create = function create(instanceConfig) {
  return createInstance(mergeConfig(axios.defaults, instanceConfig));
};

// Expose Cancel & CancelToken
axios.Cancel = Cancel_1;
axios.CancelToken = CancelToken_1;
axios.isCancel = isCancel;

// Expose all/spread
axios.all = function all(promises) {
  return Promise.all(promises);
};
axios.spread = spread;

var axios_1 = axios;

// Allow use of default import syntax in TypeScript
var default_1 = axios;
axios_1.default = default_1;

var axios$1 = axios_1;

var httpCommon = axios$1.create({
  baseURL: 'http://localhost:3000/api',
  headers: {
    'Content-type': 'application/json',
  },
});

function create(vote) {
  return httpCommon.post('/artists', vote);
}

function get() {
  return httpCommon.get(`/artists`);
}

function destroy() {
  return httpCommon.delete(`/artists`);
}

var ArtistService = {
  create,
  get,
  destroy,
};

function create$1(vote) {
  return httpCommon.post('/spectators', vote);
}

function get$1() {
  return httpCommon.get(`/spectators`);
}

function destroy$1() {
  return httpCommon.delete(`/spectators`);
}

var SpectatorService = {
  create: create$1,
  get: get$1,
  destroy: destroy$1,
};

/* src/routes/Admin.svelte generated by Svelte v3.29.4 */

const css = {
	code: "main.svelte-7tltmx.svelte-7tltmx{font-family:'Abhaya Libre';font-size:2.5rem}.titleContainer.svelte-7tltmx.svelte-7tltmx{background-image:linear-gradient(\n      45deg,\n      rgb(18, 26, 58) 0%,\n      rgb(39, 9, 55) 100%\n    );height:30rem;display:flex;justify-content:center;align-items:center}h1.svelte-7tltmx.svelte-7tltmx{font-family:'Rye';font-size:6rem;color:#ffde59;text-align:center}.mainContainer.svelte-7tltmx.svelte-7tltmx{margin:-60px 30px 0;border-radius:6px;box-shadow:0 16px 24px 2px rgba(0, 0, 0, 0.14),\n      0 6px 30px 5px rgba(0, 0, 0, 0.12), 0 8px 10px -5px rgba(0, 0, 0, 0.2);background-color:#fff;background-size:contain;margin-bottom:50px;padding-bottom:50px;display:flex;flex-direction:column;align-items:center;box-sizing:content-box}h2.svelte-7tltmx.svelte-7tltmx{font-family:'Rye';font-size:3rem;padding-top:40px;text-align:center}.details.svelte-7tltmx.svelte-7tltmx{display:flex}.details.svelte-7tltmx p.svelte-7tltmx{margin-left:15px}.destroyVotes.svelte-7tltmx.svelte-7tltmx{border:4px solid rgb(200, 0, 0);border-radius:10px;background-color:transparent;color:rgb(200, 0, 0);font-size:1.7rem;line-height:0;font-weight:bold;padding:10px;width:190px;height:50px;margin-right:15px;cursor:pointer;transition:all 300ms}.destroyVotes.svelte-7tltmx.svelte-7tltmx:hover{background-color:rgb(200, 0, 0);color:#fff}.votesBar.svelte-7tltmx.svelte-7tltmx{display:inline-block;margin-left:20px;margin-right:20px;height:1.5rem}.filterCategories.svelte-7tltmx.svelte-7tltmx{display:flex}button.svelte-7tltmx.svelte-7tltmx{width:2rem;height:2rem;align-self:center;margin-left:15px;border-radius:5px}h3.svelte-7tltmx.svelte-7tltmx{border-bottom:2px solid rgba(39, 9, 55, 0.5);width:50%;text-align:center}.tableWrapper.svelte-7tltmx.svelte-7tltmx{height:800px;overflow:auto;width:500px}tr.svelte-7tltmx.svelte-7tltmx,td.svelte-7tltmx.svelte-7tltmx{border:2px solid rgb(39, 9, 55);padding:20px}",
	map: "{\"version\":3,\"file\":\"Admin.svelte\",\"sources\":[\"Admin.svelte\"],\"sourcesContent\":[\"<script>\\n  import { onMount } from 'svelte';\\n\\n  import ArtistService from '../services/ArtistService';\\n  import SpectatorService from '../services/SpectatorService';\\n\\n  let nbVotes = 0;\\n\\n  let showArtists = true;\\n  let showSpectators = true;\\n\\n  let artists = [];\\n  let spectators = [];\\n\\n  let cumulatedVotes = [];\\n  let votesTicketNumbers = [];\\n\\n  function getCumulatedVotes(voters) {\\n    voters.forEach(({ vote }) => {\\n      if (votesTicketNumbers.indexOf(vote) === -1) {\\n        votesTicketNumbers.push(vote);\\n        cumulatedVotes = [...cumulatedVotes, { ticketNumber: vote, nbVote: 1 }];\\n      } else {\\n        let artist = cumulatedVotes.find(\\n          (votes) => votes.ticketNumber === vote\\n        );\\n        artist.nbVote++;\\n      }\\n    });\\n  }\\n  onMount(async () => {\\n    const resArtists = await ArtistService.get();\\n    artists = resArtists.data;\\n    const resSpectators = await SpectatorService.get();\\n    spectators = resSpectators.data;\\n\\n    getCumulatedVotes(artists);\\n    getCumulatedVotes(spectators);\\n    cumulatedVotes.sort((artistX, artistY) => {\\n      return artistY.nbVote - artistX.nbVote;\\n    });\\n\\n    nbVotes = artists.length + spectators.length;\\n  });\\n\\n  function handleDestroy() {\\n    if (confirm('Voulez-vous supprimer tous les votes ?')) {\\n      ArtistService.destroy().then(() => (artists = []));\\n      SpectatorService.destroy().then(() => (spectators = []));\\n      nbVotes = 0;\\n      cumulatedVotes = [];\\n      votesTicketNumbers = [];\\n    } else {\\n      return;\\n    }\\n  }\\n</script>\\n\\n<style>\\n  main {\\n    font-family: 'Abhaya Libre';\\n    font-size: 2.5rem;\\n  }\\n  .titleContainer {\\n    background-image: linear-gradient(\\n      45deg,\\n      rgb(18, 26, 58) 0%,\\n      rgb(39, 9, 55) 100%\\n    );\\n    height: 30rem;\\n    display: flex;\\n    justify-content: center;\\n    align-items: center;\\n  }\\n\\n  h1 {\\n    font-family: 'Rye';\\n    font-size: 6rem;\\n    color: #ffde59;\\n    text-align: center;\\n  }\\n\\n  .mainContainer {\\n    margin: -60px 30px 0;\\n    border-radius: 6px;\\n    box-shadow: 0 16px 24px 2px rgba(0, 0, 0, 0.14),\\n      0 6px 30px 5px rgba(0, 0, 0, 0.12), 0 8px 10px -5px rgba(0, 0, 0, 0.2);\\n    background-color: #fff;\\n    background-size: contain;\\n    margin-bottom: 50px;\\n    padding-bottom: 50px;\\n    display: flex;\\n    flex-direction: column;\\n    align-items: center;\\n    box-sizing: content-box;\\n  }\\n\\n  h2 {\\n    font-family: 'Rye';\\n    font-size: 3rem;\\n    padding-top: 40px;\\n    text-align: center;\\n  }\\n\\n  .details {\\n    display: flex;\\n  }\\n\\n  .details p {\\n    margin-left: 15px;\\n  }\\n\\n  .destroyVotes {\\n    border: 4px solid rgb(200, 0, 0);\\n    border-radius: 10px;\\n    background-color: transparent;\\n    color: rgb(200, 0, 0);\\n    font-size: 1.7rem;\\n    line-height: 0;\\n    font-weight: bold;\\n    padding: 10px;\\n    width: 190px;\\n    height: 50px;\\n    margin-right: 15px;\\n    cursor: pointer;\\n    transition: all 300ms;\\n  }\\n\\n  .destroyVotes:hover {\\n    background-color: rgb(200, 0, 0);\\n    color: #fff;\\n  }\\n\\n  .votesBar {\\n    display: inline-block;\\n    margin-left: 20px;\\n    margin-right: 20px;\\n    height: 1.5rem;\\n  }\\n\\n  .filterCategories {\\n    display: flex;\\n  }\\n\\n  button {\\n    width: 2rem;\\n    height: 2rem;\\n    align-self: center;\\n    margin-left: 15px;\\n    border-radius: 5px;\\n  }\\n\\n  h3 {\\n    border-bottom: 2px solid rgba(39, 9, 55, 0.5);\\n    width: 50%;\\n    text-align: center;\\n  }\\n\\n  .tableWrapper {\\n    height: 800px;\\n    overflow: auto;\\n    width: 500px;\\n  }\\n  tr,\\n  td {\\n    border: 2px solid rgb(39, 9, 55);\\n    padding: 20px;\\n  }\\n</style>\\n\\n<main>\\n  <div class=\\\"titleContainer\\\">\\n    <h1>Talents du Nord</h1>\\n  </div>\\n\\n  <div class=\\\"mainContainer\\\">\\n    <h2>Administration</h2>\\n    <div class=\\\"details\\\">\\n      <button class=\\\"destroyVotes\\\" on:click={handleDestroy}>Reset votes</button>\\n      <p>Nombre de votes : <strong>{nbVotes}</strong></p>\\n    </div>\\n\\n    <div>\\n      {#each cumulatedVotes as { ticketNumber, nbVote }}\\n        <p>\\n          {ticketNumber},\\n          <span\\n            class=\\\"votesBar\\\"\\n            style=\\\"width:{(nbVote * 300) / nbVotes}px; background-color:hsl({(nbVote * 360) / nbVotes}, 90%, 50%)\\\" />{nbVote}\\n        </p>\\n      {/each}\\n    </div>\\n\\n    <div class=\\\"filterCategories\\\">\\n      <label for=\\\"artists\\\">Artistes</label>\\n      <button\\n        type=\\\"checkbox\\\"\\n        style=\\\"margin-right: 30px; background-color: {showArtists ? '#ffde59' : 'rgb(39,9,55)'}\\\"\\n        on:click={() => (showArtists = !showArtists)} />\\n\\n      <label for=\\\"spectators\\\" style=\\\"margin-left: 30px\\\">Spectateurs</label>\\n      <button\\n        style=\\\"background-color: {showSpectators ? '#ffde59' : 'rgb(39,9,55)'}\\\"\\n        type=\\\"checkbox\\\"\\n        on:click={() => (showSpectators = !showSpectators)} />\\n    </div>\\n\\n    <h3>Votes</h3>\\n\\n    <div class=\\\"tableWrapper\\\">\\n      <table>\\n        <tbody>\\n          {#if showArtists}\\n            {#each artists as artist}\\n              <tr>\\n                <td>N° de ticket: {artist.ticketNumber}</td>\\n                <td>Vote: {artist.vote}</td>\\n              </tr>\\n            {/each}\\n          {/if}\\n          {#if showSpectators}\\n            {#each spectators as spectator}\\n              <tr>\\n                <td>N° de ticket: {spectator.ticketNumber}</td>\\n                <td>Vote: {spectator.vote}</td>\\n              </tr>\\n            {/each}\\n          {/if}\\n        </tbody>\\n      </table>\\n    </div>\\n  </div>\\n</main>\\n\"],\"names\":[],\"mappings\":\"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\"}"
};

const Admin = create_ssr_component(($$result, $$props, $$bindings, slots) => {
	let nbVotes = 0;
	let artists = [];
	let spectators = [];
	let cumulatedVotes = [];
	let votesTicketNumbers = [];

	function getCumulatedVotes(voters) {
		voters.forEach(({ vote }) => {
			if (votesTicketNumbers.indexOf(vote) === -1) {
				votesTicketNumbers.push(vote);
				cumulatedVotes = [...cumulatedVotes, { ticketNumber: vote, nbVote: 1 }];
			} else {
				let artist = cumulatedVotes.find(votes => votes.ticketNumber === vote);
				artist.nbVote++;
			}
		});
	}

	onMount(async () => {
		const resArtists = await ArtistService.get();
		artists = resArtists.data;
		const resSpectators = await SpectatorService.get();
		spectators = resSpectators.data;
		getCumulatedVotes(artists);
		getCumulatedVotes(spectators);

		cumulatedVotes.sort((artistX, artistY) => {
			return artistY.nbVote - artistX.nbVote;
		});

		nbVotes = artists.length + spectators.length;
	});

	$$result.css.add(css);

	return `<main class="${"svelte-7tltmx"}"><div class="${"titleContainer svelte-7tltmx"}"><h1 class="${"svelte-7tltmx"}">Talents du Nord</h1></div>

  <div class="${"mainContainer svelte-7tltmx"}"><h2 class="${"svelte-7tltmx"}">Administration</h2>
    <div class="${"details svelte-7tltmx"}"><button class="${"destroyVotes svelte-7tltmx"}">Reset votes</button>
      <p class="${"svelte-7tltmx"}">Nombre de votes : <strong>${escape(nbVotes)}</strong></p></div>

    <div>${each(cumulatedVotes, ({ ticketNumber, nbVote }) => `<p>${escape(ticketNumber)},
          <span class="${"votesBar svelte-7tltmx"}" style="${"width:" + escape(nbVote * 300 / nbVotes) + "px; background-color:hsl(" + escape(nbVote * 360 / nbVotes) + ", 90%, 50%)"}"></span>${escape(nbVote)}
        </p>`)}</div>

    <div class="${"filterCategories svelte-7tltmx"}"><label for="${"artists"}">Artistes</label>
      <button type="${"checkbox"}" style="${"margin-right: 30px; background-color: " + escape( "#ffde59" )}" class="${"svelte-7tltmx"}"></button>

      <label for="${"spectators"}" style="${"margin-left: 30px"}">Spectateurs</label>
      <button style="${"background-color: " + escape( "#ffde59" )}" type="${"checkbox"}" class="${"svelte-7tltmx"}"></button></div>

    <h3 class="${"svelte-7tltmx"}">Votes</h3>

    <div class="${"tableWrapper svelte-7tltmx"}"><table><tbody>${ `${each(artists, artist => `<tr class="${"svelte-7tltmx"}"><td class="${"svelte-7tltmx"}">N° de ticket: ${escape(artist.ticketNumber)}</td>
                <td class="${"svelte-7tltmx"}">Vote: ${escape(artist.vote)}</td>
              </tr>`)}`
	}
          ${ `${each(spectators, spectator => `<tr class="${"svelte-7tltmx"}"><td class="${"svelte-7tltmx"}">N° de ticket: ${escape(spectator.ticketNumber)}</td>
                <td class="${"svelte-7tltmx"}">Vote: ${escape(spectator.vote)}</td>
              </tr>`)}`
	}</tbody></table></div></div></main>`;
});

/* src/routes/Home.svelte generated by Svelte v3.29.4 */

const css$1 = {
	code: ".titleContainer.svelte-v12y1r.svelte-v12y1r{background-image:linear-gradient(\n      45deg,\n      rgb(18, 26, 58) 0%,\n      rgb(39, 9, 55) 100%\n    );height:30rem;display:flex;justify-content:center;align-items:center}h1.svelte-v12y1r.svelte-v12y1r{font-family:'Rye';font-size:6rem;color:#ffde59;text-align:center}.mainContainer.svelte-v12y1r.svelte-v12y1r{margin:-60px 30px 0;border-radius:6px;box-shadow:0 16px 24px 2px rgba(0, 0, 0, 0.14),\n      0 6px 30px 5px rgba(0, 0, 0, 0.12), 0 8px 10px -5px rgba(0, 0, 0, 0.2);background-color:#fff;background-size:contain;margin-bottom:50px;padding-bottom:50px;display:flex;flex-direction:column;align-items:center;box-sizing:content-box}h2.svelte-v12y1r.svelte-v12y1r{font-family:'Rye';font-size:3rem;padding-top:40px;text-align:center}.errors.svelte-v12y1r li.svelte-v12y1r{color:rgb(200, 0, 0);list-style:none;font-size:1.5rem;font-weight:bold}form.svelte-v12y1r.svelte-v12y1r{font-family:'Abhaya Libre';display:flex;flex-direction:column;padding:50px;font-size:2rem;border-top:2px solid rgba(39, 9, 55, 0.5)}label.svelte-v12y1r.svelte-v12y1r{align-self:center}select.svelte-v12y1r.svelte-v12y1r{font-size:2rem;margin:15px;border:2px solid rgb(39, 9, 55);border-radius:10px;padding:5px;background-color:#fff;font-family:'Abhaya Libre';appearance:none;-webkit-appearance:none;-moz-appearance:none;cursor:pointer}.ticket.svelte-v12y1r.svelte-v12y1r{display:flex;flex-wrap:nowrap}input.svelte-v12y1r.svelte-v12y1r{font-size:2rem;margin:15px;border:2px solid rgb(39, 9, 55);border-radius:10px;padding:5px;font-family:'Abhaya Libre';transition:all 250ms}input.svelte-v12y1r.svelte-v12y1r:hover,input.svelte-v12y1r.svelte-v12y1r:focus,select.svelte-v12y1r.svelte-v12y1r:hover,select.svelte-v12y1r.svelte-v12y1r:focus{border-color:#ffde59;border-radius:10px}button.svelte-v12y1r.svelte-v12y1r{border:2px solid rgb(39, 9, 55);border-radius:10px;padding:10px;font-size:2.5rem;margin-top:20px;font-family:'Abhaya Libre';font-weight:bold;background-color:rgb(39, 9, 55);color:#ffde59;cursor:pointer}.voted.svelte-v12y1r.svelte-v12y1r{font-size:2rem;font-weight:bold;color:#ffde59;background-color:rgb(39, 9, 55);border-radius:10px;padding:20px}",
	map: "{\"version\":3,\"file\":\"Home.svelte\",\"sources\":[\"Home.svelte\"],\"sourcesContent\":[\"<script>\\n  import { onMount } from 'svelte';\\n\\n  import ArtistService from '../services/ArtistService';\\n  import SpectatorService from '../services/SpectatorService';\\n\\n  const categories = ['Spectateur', 'Artiste'];\\n  const artists = ['Michel', 'Jean', 'Edouard', 'Catherine'];\\n\\n  let ticketDirection;\\n\\n  onMount(() => {\\n    ticketDirection = window.innerHeight > window.innerWidth ? 'column' : 'row';\\n  });\\n\\n  let categorie = 'Spectateur';\\n  let ticketNumber = '';\\n  let vote = artists[0];\\n  let errors = [];\\n  let voted = false;\\n\\n  function handleErrors(err) {\\n    err.response.data.message.forEach(({ message }) => {\\n      let error;\\n      if (message.includes('max'))\\n        error = 'Le n° de ticket doit être inférieur à 200';\\n      else if (message.includes('min'))\\n        error = 'Ce n° de ticket doit être supérieur à 0';\\n      else if (message.includes('unique'))\\n        error = 'Ce n° de ticket a déjà été utilisé';\\n      else error = message;\\n      errors = [...errors, error];\\n    });\\n  }\\n\\n  function handleSubmit() {\\n    const voter = { ticketNumber, vote };\\n    errors = [];\\n    if (categorie === 'Spectateur') {\\n      SpectatorService.create(voter)\\n        .then(() => (voted = true))\\n        .catch(handleErrors);\\n    } else {\\n      ArtistService.create(voter)\\n        .then(() => (voted = true))\\n        .catch(handleErrors);\\n    }\\n  }\\n</script>\\n\\n<style>\\n  .titleContainer {\\n    background-image: linear-gradient(\\n      45deg,\\n      rgb(18, 26, 58) 0%,\\n      rgb(39, 9, 55) 100%\\n    );\\n    height: 30rem;\\n    display: flex;\\n    justify-content: center;\\n    align-items: center;\\n  }\\n\\n  h1 {\\n    font-family: 'Rye';\\n    font-size: 6rem;\\n    color: #ffde59;\\n    text-align: center;\\n  }\\n\\n  .mainContainer {\\n    margin: -60px 30px 0;\\n    border-radius: 6px;\\n    box-shadow: 0 16px 24px 2px rgba(0, 0, 0, 0.14),\\n      0 6px 30px 5px rgba(0, 0, 0, 0.12), 0 8px 10px -5px rgba(0, 0, 0, 0.2);\\n    background-color: #fff;\\n    background-size: contain;\\n    margin-bottom: 50px;\\n    padding-bottom: 50px;\\n    display: flex;\\n    flex-direction: column;\\n    align-items: center;\\n    box-sizing: content-box;\\n  }\\n\\n  h2 {\\n    font-family: 'Rye';\\n    font-size: 3rem;\\n    padding-top: 40px;\\n    text-align: center;\\n  }\\n\\n  .errors li {\\n    color: rgb(200, 0, 0);\\n    list-style: none;\\n    font-size: 1.5rem;\\n    font-weight: bold;\\n  }\\n\\n  form {\\n    font-family: 'Abhaya Libre';\\n    display: flex;\\n    flex-direction: column;\\n    padding: 50px;\\n    font-size: 2rem;\\n    border-top: 2px solid rgba(39, 9, 55, 0.5);\\n  }\\n\\n  label {\\n    align-self: center;\\n  }\\n\\n  select {\\n    font-size: 2rem;\\n    margin: 15px;\\n    border: 2px solid rgb(39, 9, 55);\\n    border-radius: 10px;\\n    padding: 5px;\\n    background-color: #fff;\\n    font-family: 'Abhaya Libre';\\n    appearance: none;\\n    -webkit-appearance: none;\\n    -moz-appearance: none;\\n    cursor: pointer;\\n  }\\n\\n  .ticket {\\n    display: flex;\\n    flex-wrap: nowrap;\\n  }\\n\\n  input {\\n    font-size: 2rem;\\n    margin: 15px;\\n    border: 2px solid rgb(39, 9, 55);\\n    border-radius: 10px;\\n    padding: 5px;\\n    font-family: 'Abhaya Libre';\\n    transition: all 250ms;\\n  }\\n\\n  input:hover,\\n  input:focus,\\n  select:hover,\\n  select:focus {\\n    border-color: #ffde59;\\n    border-radius: 10px;\\n  }\\n\\n  button {\\n    border: 2px solid rgb(39, 9, 55);\\n    border-radius: 10px;\\n    padding: 10px;\\n    font-size: 2.5rem;\\n    margin-top: 20px;\\n    font-family: 'Abhaya Libre';\\n    font-weight: bold;\\n    background-color: rgb(39, 9, 55);\\n    color: #ffde59;\\n    cursor: pointer;\\n  }\\n\\n  .voted {\\n    font-size: 2rem;\\n    font-weight: bold;\\n    color: #ffde59;\\n    background-color: rgb(39, 9, 55);\\n    border-radius: 10px;\\n    padding: 20px;\\n  }\\n</style>\\n\\n<main>\\n  <div class=\\\"titleContainer\\\">\\n    <h1>Talents du Nord</h1>\\n  </div>\\n\\n  <div class=\\\"mainContainer\\\">\\n    <h2>TDN-12 Novembre 2020</h2>\\n\\n    {#if voted}\\n      <p class=\\\"voted\\\">Votre vote a bien été pris en compte !</p>\\n    {:else}\\n      <div class=\\\"errors\\\">\\n        <ul>\\n          {#each errors as error}\\n            <li>{error}</li>\\n          {/each}\\n        </ul>\\n      </div>\\n\\n      <form on:submit|preventDefault={handleSubmit}>\\n        <div class=\\\"ticket\\\" style=\\\"flex-direction: {ticketDirection}\\\">\\n          <label for=\\\"ticketRole\\\">Catégorie</label>\\n          <select name=\\\"ticketRole\\\" id=\\\"ticketRole\\\" bind:value={categorie}>\\n            {#each categories as categorie}\\n              <option value={categorie}>{categorie}</option>\\n            {/each}\\n          </select>\\n\\n          <label for=\\\"ticketNumber\\\">N° de place</label>\\n          <input\\n            name=\\\"ticketNumber\\\"\\n            id=\\\"ticketNumber\\\"\\n            type=\\\"number\\\"\\n            required\\n            bind:value={ticketNumber} />\\n        </div>\\n\\n        <label for=\\\"vote\\\" style=\\\"align-self: start\\\">N° du gagnant</label>\\n        <select name=\\\"vote\\\" id=\\\"vote\\\" bind:value={vote}>\\n          {#each artists as artist}\\n            <option value={artist}>{artist}</option>\\n          {/each}\\n        </select>\\n\\n        <button type=\\\"submit\\\">Voter</button>\\n      </form>\\n    {/if}\\n  </div>\\n</main>\\n\"],\"names\":[],\"mappings\":\"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\"}"
};

const Home = create_ssr_component(($$result, $$props, $$bindings, slots) => {
	const categories = ["Spectateur", "Artiste"];
	const artists = ["Michel", "Jean", "Edouard", "Catherine"];
	let ticketDirection;

	onMount(() => {
		ticketDirection = window.innerHeight > window.innerWidth
		? "column"
		: "row";
	});

	let categorie = "Spectateur";
	let ticketNumber = "";
	let vote = artists[0];
	let errors = [];

	$$result.css.add(css$1);

	return `<main><div class="${"titleContainer svelte-v12y1r"}"><h1 class="${"svelte-v12y1r"}">Talents du Nord</h1></div>

  <div class="${"mainContainer svelte-v12y1r"}"><h2 class="${"svelte-v12y1r"}">TDN-12 Novembre 2020</h2>

    ${ `<div class="${"errors svelte-v12y1r"}"><ul>${each(errors, error => `<li class="${"svelte-v12y1r"}">${escape(error)}</li>`)}</ul></div>

      <form class="${"svelte-v12y1r"}"><div class="${"ticket svelte-v12y1r"}" style="${"flex-direction: " + escape(ticketDirection)}"><label for="${"ticketRole"}" class="${"svelte-v12y1r"}">Catégorie</label>
          <select name="${"ticketRole"}" id="${"ticketRole"}" class="${"svelte-v12y1r"}"${add_attribute("value", categorie, 1)}>${each(categories, categorie => `<option${add_attribute("value", categorie, 0)}>${escape(categorie)}</option>`)}</select>

          <label for="${"ticketNumber"}" class="${"svelte-v12y1r"}">N° de place</label>
          <input name="${"ticketNumber"}" id="${"ticketNumber"}" type="${"number"}" required class="${"svelte-v12y1r"}"${add_attribute("value", ticketNumber, 1)}></div>

        <label for="${"vote"}" style="${"align-self: start"}" class="${"svelte-v12y1r"}">N° du gagnant</label>
        <select name="${"vote"}" id="${"vote"}" class="${"svelte-v12y1r"}"${add_attribute("value", vote, 1)}>${each(artists, artist => `<option${add_attribute("value", artist, 0)}>${escape(artist)}</option>`)}</select>

        <button type="${"submit"}" class="${"svelte-v12y1r"}">Voter</button></form>`}</div></main>`;
});

/* src/routes/Login.svelte generated by Svelte v3.29.4 */

const css$2 = {
	code: "main.svelte-1ruct2t.svelte-1ruct2t{font-family:'Abhaya Libre';font-size:2.5rem}.titleContainer.svelte-1ruct2t.svelte-1ruct2t{background-image:linear-gradient(\n      45deg,\n      rgb(18, 26, 58) 0%,\n      rgb(39, 9, 55) 100%\n    );height:30rem;display:flex;justify-content:center;align-items:center}h1.svelte-1ruct2t.svelte-1ruct2t{font-family:'Rye';font-size:6rem;color:#ffde59;text-align:center}.mainContainer.svelte-1ruct2t.svelte-1ruct2t{margin:-60px 30px 0;border-radius:6px;box-shadow:0 16px 24px 2px rgba(0, 0, 0, 0.14),\n      0 6px 30px 5px rgba(0, 0, 0, 0.12), 0 8px 10px -5px rgba(0, 0, 0, 0.2);background-color:#fff;background-size:contain;margin-bottom:50px;padding-bottom:50px;display:flex;flex-direction:column;align-items:center;box-sizing:content-box}h2.svelte-1ruct2t.svelte-1ruct2t{font-family:'Rye';font-size:3rem;padding-top:40px;text-align:center}.errors.svelte-1ruct2t li.svelte-1ruct2t{color:rgb(200, 0, 0);list-style:none;font-size:1.5rem;font-weight:bold}form.svelte-1ruct2t.svelte-1ruct2t{font-family:'Abhaya Libre';display:flex;flex-direction:column;padding:50px;font-size:2rem;border-top:2px solid rgba(39, 9, 55, 0.5)}label.svelte-1ruct2t.svelte-1ruct2t{align-self:center}input.svelte-1ruct2t.svelte-1ruct2t{font-size:2rem;margin:15px;border:2px solid rgb(39, 9, 55);border-radius:10px;padding:5px;font-family:'Abhaya Libre';transition:all 250ms}input.svelte-1ruct2t.svelte-1ruct2t:hover,input.svelte-1ruct2t.svelte-1ruct2t:focus{border-color:#ffde59;border-radius:10px}button.svelte-1ruct2t.svelte-1ruct2t{border:2px solid rgb(39, 9, 55);border-radius:10px;padding:10px;font-size:2.5rem;margin-top:20px;font-family:'Abhaya Libre';font-weight:bold;background-color:rgb(39, 9, 55);color:#ffde59;cursor:pointer}",
	map: "{\"version\":3,\"file\":\"Login.svelte\",\"sources\":[\"Login.svelte\"],\"sourcesContent\":[\"<script>\\n  import LoginService from '../services/LoginService';\\n  import { navigate } from 'svelte-routing';\\n\\n  let errors = [];\\n\\n  let username = '';\\n  let password = '';\\n\\n  function handleSubmit() {\\n    const user = { username, password };\\n    console.log(user);\\n    LoginService.create(user)\\n      .then((res) => {\\n        navigate('/admin', { replace: true });\\n      })\\n      .catch((err) => (errors = [err.response.data.message]));\\n  }\\n</script>\\n\\n<style>\\n  main {\\n    font-family: 'Abhaya Libre';\\n    font-size: 2.5rem;\\n  }\\n  .titleContainer {\\n    background-image: linear-gradient(\\n      45deg,\\n      rgb(18, 26, 58) 0%,\\n      rgb(39, 9, 55) 100%\\n    );\\n    height: 30rem;\\n    display: flex;\\n    justify-content: center;\\n    align-items: center;\\n  }\\n\\n  h1 {\\n    font-family: 'Rye';\\n    font-size: 6rem;\\n    color: #ffde59;\\n    text-align: center;\\n  }\\n\\n  .mainContainer {\\n    margin: -60px 30px 0;\\n    border-radius: 6px;\\n    box-shadow: 0 16px 24px 2px rgba(0, 0, 0, 0.14),\\n      0 6px 30px 5px rgba(0, 0, 0, 0.12), 0 8px 10px -5px rgba(0, 0, 0, 0.2);\\n    background-color: #fff;\\n    background-size: contain;\\n    margin-bottom: 50px;\\n    padding-bottom: 50px;\\n    display: flex;\\n    flex-direction: column;\\n    align-items: center;\\n    box-sizing: content-box;\\n  }\\n\\n  h2 {\\n    font-family: 'Rye';\\n    font-size: 3rem;\\n    padding-top: 40px;\\n    text-align: center;\\n  }\\n\\n  .errors li {\\n    color: rgb(200, 0, 0);\\n    list-style: none;\\n    font-size: 1.5rem;\\n    font-weight: bold;\\n  }\\n\\n  form {\\n    font-family: 'Abhaya Libre';\\n    display: flex;\\n    flex-direction: column;\\n    padding: 50px;\\n    font-size: 2rem;\\n    border-top: 2px solid rgba(39, 9, 55, 0.5);\\n  }\\n\\n  label {\\n    align-self: center;\\n  }\\n\\n  input {\\n    font-size: 2rem;\\n    margin: 15px;\\n    border: 2px solid rgb(39, 9, 55);\\n    border-radius: 10px;\\n    padding: 5px;\\n    font-family: 'Abhaya Libre';\\n    transition: all 250ms;\\n  }\\n\\n  input:hover,\\n  input:focus {\\n    border-color: #ffde59;\\n    border-radius: 10px;\\n  }\\n\\n  button {\\n    border: 2px solid rgb(39, 9, 55);\\n    border-radius: 10px;\\n    padding: 10px;\\n    font-size: 2.5rem;\\n    margin-top: 20px;\\n    font-family: 'Abhaya Libre';\\n    font-weight: bold;\\n    background-color: rgb(39, 9, 55);\\n    color: #ffde59;\\n    cursor: pointer;\\n  }\\n</style>\\n\\n<main>\\n  <div class=\\\"titleContainer\\\">\\n    <h1>Talents du Nord</h1>\\n  </div>\\n\\n  <div class=\\\"mainContainer\\\">\\n    <h2>Login</h2>\\n\\n    <div class=\\\"errors\\\">\\n      <ul>\\n        {#each errors as error}\\n          <li>{error}</li>\\n        {/each}\\n      </ul>\\n    </div>\\n\\n    <form on:submit|preventDefault={handleSubmit}>\\n      <label for=\\\"username\\\">Username</label>\\n      <input type=\\\"text\\\" id=\\\"username\\\" bind:value={username} required />\\n\\n      <label for=\\\"password\\\">Password</label>\\n      <input type=\\\"password\\\" id=\\\"password\\\" bind:value={password} required />\\n\\n      <button type=\\\"submit\\\">Login</button>\\n    </form>\\n  </div>\\n</main>\\n\"],\"names\":[],\"mappings\":\"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\"}"
};

const Login = create_ssr_component(($$result, $$props, $$bindings, slots) => {
	let errors = [];
	let username = "";
	let password = "";

	$$result.css.add(css$2);

	return `<main class="${"svelte-1ruct2t"}"><div class="${"titleContainer svelte-1ruct2t"}"><h1 class="${"svelte-1ruct2t"}">Talents du Nord</h1></div>

  <div class="${"mainContainer svelte-1ruct2t"}"><h2 class="${"svelte-1ruct2t"}">Login</h2>

    <div class="${"errors svelte-1ruct2t"}"><ul>${each(errors, error => `<li class="${"svelte-1ruct2t"}">${escape(error)}</li>`)}</ul></div>

    <form class="${"svelte-1ruct2t"}"><label for="${"username"}" class="${"svelte-1ruct2t"}">Username</label>
      <input type="${"text"}" id="${"username"}" required class="${"svelte-1ruct2t"}"${add_attribute("value", username, 1)}>

      <label for="${"password"}" class="${"svelte-1ruct2t"}">Password</label>
      <input type="${"password"}" id="${"password"}" required class="${"svelte-1ruct2t"}"${add_attribute("value", password, 1)}>

      <button type="${"submit"}" class="${"svelte-1ruct2t"}">Login</button></form></div></main>`;
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
