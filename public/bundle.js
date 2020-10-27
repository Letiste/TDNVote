
(function(l, r) { if (l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (window.location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.getElementsByTagName('head')[0].appendChild(r) })(window.document);
var app = (function () {
    'use strict';

    function noop() { }
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
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
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function subscribe(store, ...callbacks) {
        if (store == null) {
            return noop;
        }
        const unsub = store.subscribe(...callbacks);
        return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
    }
    function component_subscribe(component, store, callback) {
        component.$$.on_destroy.push(subscribe(store, callback));
    }
    function create_slot(definition, ctx, $$scope, fn) {
        if (definition) {
            const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
            return definition[0](slot_ctx);
        }
    }
    function get_slot_context(definition, ctx, $$scope, fn) {
        return definition[1] && fn
            ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
            : $$scope.ctx;
    }
    function get_slot_changes(definition, $$scope, dirty, fn) {
        if (definition[2] && fn) {
            const lets = definition[2](fn(dirty));
            if ($$scope.dirty === undefined) {
                return lets;
            }
            if (typeof lets === 'object') {
                const merged = [];
                const len = Math.max($$scope.dirty.length, lets.length);
                for (let i = 0; i < len; i += 1) {
                    merged[i] = $$scope.dirty[i] | lets[i];
                }
                return merged;
            }
            return $$scope.dirty | lets;
        }
        return $$scope.dirty;
    }
    function update_slot(slot, slot_definition, ctx, $$scope, dirty, get_slot_changes_fn, get_slot_context_fn) {
        const slot_changes = get_slot_changes(slot_definition, $$scope, dirty, get_slot_changes_fn);
        if (slot_changes) {
            const slot_context = get_slot_context(slot_definition, ctx, $$scope, get_slot_context_fn);
            slot.p(slot_context, slot_changes);
        }
    }
    function exclude_internal_props(props) {
        const result = {};
        for (const k in props)
            if (k[0] !== '$')
                result[k] = props[k];
        return result;
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function svg_element(name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function claim_element(nodes, name, attributes, svg) {
        for (let i = 0; i < nodes.length; i += 1) {
            const node = nodes[i];
            if (node.nodeName === name) {
                let j = 0;
                const remove = [];
                while (j < node.attributes.length) {
                    const attribute = node.attributes[j++];
                    if (!attributes[attribute.name]) {
                        remove.push(attribute.name);
                    }
                }
                for (let k = 0; k < remove.length; k++) {
                    node.removeAttribute(remove[k]);
                }
                return nodes.splice(i, 1)[0];
            }
        }
        return svg ? svg_element(name) : element(name);
    }
    function claim_text(nodes, data) {
        for (let i = 0; i < nodes.length; i += 1) {
            const node = nodes[i];
            if (node.nodeType === 3) {
                node.data = '' + data;
                return nodes.splice(i, 1)[0];
            }
        }
        return text(data);
    }
    function claim_space(nodes) {
        return claim_text(nodes, ' ');
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.wholeText !== data)
            text.data = data;
    }
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
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

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }

    function get_spread_update(levels, updates) {
        const update = {};
        const to_null_out = {};
        const accounted_for = { $$scope: 1 };
        let i = levels.length;
        while (i--) {
            const o = levels[i];
            const n = updates[i];
            if (n) {
                for (const key in o) {
                    if (!(key in n))
                        to_null_out[key] = 1;
                }
                for (const key in n) {
                    if (!accounted_for[key]) {
                        update[key] = n[key];
                        accounted_for[key] = 1;
                    }
                }
                levels[i] = n;
            }
            else {
                for (const key in o) {
                    accounted_for[key] = 1;
                }
            }
        }
        for (const key in to_null_out) {
            if (!(key in update))
                update[key] = undefined;
        }
        return update;
    }
    function get_spread_object(spread_props) {
        return typeof spread_props === 'object' && spread_props !== null ? spread_props : {};
    }
    function create_component(block) {
        block && block.c();
    }
    function claim_component(block, parent_nodes) {
        block && block.l(parent_nodes);
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
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

    function create_fragment(ctx) {
    	let current;
    	const default_slot_template = /*#slots*/ ctx[6].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[5], null);

    	return {
    		c() {
    			if (default_slot) default_slot.c();
    		},
    		l(nodes) {
    			if (default_slot) default_slot.l(nodes);
    		},
    		m(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 32) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[5], dirty, null, null);
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let $base;
    	let $location;
    	let $routes;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	let { basepath = "/" } = $$props;
    	let { url = null } = $$props;
    	const locationContext = getContext(LOCATION);
    	const routerContext = getContext(ROUTER);
    	const routes = writable([]);
    	component_subscribe($$self, routes, value => $$invalidate(10, $routes = value));
    	const activeRoute = writable(null);
    	let hasActiveRoute = false; // Used in SSR to synchronously set that a Route is active.

    	// If locationContext is not set, this is the topmost Router in the tree.
    	// If the `url` prop is given we force the location to it.
    	const location = locationContext || writable(url ? { pathname: url } : globalHistory.location);

    	component_subscribe($$self, location, value => $$invalidate(9, $location = value));

    	// If routerContext is set, the routerBase of the parent Router
    	// will be the base for this Router's descendants.
    	// If routerContext is not set, the path and resolved uri will both
    	// have the value of the basepath prop.
    	const base = routerContext
    	? routerContext.routerBase
    	: writable({ path: basepath, uri: basepath });

    	component_subscribe($$self, base, value => $$invalidate(8, $base = value));

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

    	$$self.$$set = $$props => {
    		if ("basepath" in $$props) $$invalidate(3, basepath = $$props.basepath);
    		if ("url" in $$props) $$invalidate(4, url = $$props.url);
    		if ("$$scope" in $$props) $$invalidate(5, $$scope = $$props.$$scope);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*$base*/ 256) {
    			// This reactive statement will update all the Routes' path when
    			// the basepath changes.
    			 {
    				const { path: basepath } = $base;

    				routes.update(rs => {
    					rs.forEach(r => r.path = combinePaths(basepath, r._path));
    					return rs;
    				});
    			}
    		}

    		if ($$self.$$.dirty & /*$routes, $location*/ 1536) {
    			// This reactive statement will be run when the Router is created
    			// when there are no Routes and then again the following tick, so it
    			// will not find an active Route in SSR and in the browser it will only
    			// pick an active Route after all Routes have been registered.
    			 {
    				const bestMatch = pick($routes, $location.pathname);
    				activeRoute.set(bestMatch);
    			}
    		}
    	};

    	return [routes, location, base, basepath, url, $$scope, slots];
    }

    class Router extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance, create_fragment, safe_not_equal, { basepath: 3, url: 4 });
    	}
    }

    /* node_modules/svelte-routing/src/Route.svelte generated by Svelte v3.29.4 */

    const get_default_slot_changes = dirty => ({
    	params: dirty & /*routeParams*/ 2,
    	location: dirty & /*$location*/ 16
    });

    const get_default_slot_context = ctx => ({
    	params: /*routeParams*/ ctx[1],
    	location: /*$location*/ ctx[4]
    });

    // (40:0) {#if $activeRoute !== null && $activeRoute.route === route}
    function create_if_block(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block_1, create_else_block];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*component*/ ctx[0] !== null) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	return {
    		c() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		l(nodes) {
    			if_block.l(nodes);
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    // (43:2) {:else}
    function create_else_block(ctx) {
    	let current;
    	const default_slot_template = /*#slots*/ ctx[10].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[9], get_default_slot_context);

    	return {
    		c() {
    			if (default_slot) default_slot.c();
    		},
    		l(nodes) {
    			if (default_slot) default_slot.l(nodes);
    		},
    		m(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope, routeParams, $location*/ 530) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[9], dirty, get_default_slot_changes, get_default_slot_context);
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    // (41:2) {#if component !== null}
    function create_if_block_1(ctx) {
    	let switch_instance;
    	let switch_instance_anchor;
    	let current;

    	const switch_instance_spread_levels = [
    		{ location: /*$location*/ ctx[4] },
    		/*routeParams*/ ctx[1],
    		/*routeProps*/ ctx[2]
    	];

    	var switch_value = /*component*/ ctx[0];

    	function switch_props(ctx) {
    		let switch_instance_props = {};

    		for (let i = 0; i < switch_instance_spread_levels.length; i += 1) {
    			switch_instance_props = assign(switch_instance_props, switch_instance_spread_levels[i]);
    		}

    		return { props: switch_instance_props };
    	}

    	if (switch_value) {
    		switch_instance = new switch_value(switch_props());
    	}

    	return {
    		c() {
    			if (switch_instance) create_component(switch_instance.$$.fragment);
    			switch_instance_anchor = empty();
    		},
    		l(nodes) {
    			if (switch_instance) claim_component(switch_instance.$$.fragment, nodes);
    			switch_instance_anchor = empty();
    		},
    		m(target, anchor) {
    			if (switch_instance) {
    				mount_component(switch_instance, target, anchor);
    			}

    			insert(target, switch_instance_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const switch_instance_changes = (dirty & /*$location, routeParams, routeProps*/ 22)
    			? get_spread_update(switch_instance_spread_levels, [
    					dirty & /*$location*/ 16 && { location: /*$location*/ ctx[4] },
    					dirty & /*routeParams*/ 2 && get_spread_object(/*routeParams*/ ctx[1]),
    					dirty & /*routeProps*/ 4 && get_spread_object(/*routeProps*/ ctx[2])
    				])
    			: {};

    			if (switch_value !== (switch_value = /*component*/ ctx[0])) {
    				if (switch_instance) {
    					group_outros();
    					const old_component = switch_instance;

    					transition_out(old_component.$$.fragment, 1, 0, () => {
    						destroy_component(old_component, 1);
    					});

    					check_outros();
    				}

    				if (switch_value) {
    					switch_instance = new switch_value(switch_props());
    					create_component(switch_instance.$$.fragment);
    					transition_in(switch_instance.$$.fragment, 1);
    					mount_component(switch_instance, switch_instance_anchor.parentNode, switch_instance_anchor);
    				} else {
    					switch_instance = null;
    				}
    			} else if (switch_value) {
    				switch_instance.$set(switch_instance_changes);
    			}
    		},
    		i(local) {
    			if (current) return;
    			if (switch_instance) transition_in(switch_instance.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			if (switch_instance) transition_out(switch_instance.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(switch_instance_anchor);
    			if (switch_instance) destroy_component(switch_instance, detaching);
    		}
    	};
    }

    function create_fragment$1(ctx) {
    	let if_block_anchor;
    	let current;
    	let if_block = /*$activeRoute*/ ctx[3] !== null && /*$activeRoute*/ ctx[3].route === /*route*/ ctx[7] && create_if_block(ctx);

    	return {
    		c() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		l(nodes) {
    			if (if_block) if_block.l(nodes);
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (/*$activeRoute*/ ctx[3] !== null && /*$activeRoute*/ ctx[3].route === /*route*/ ctx[7]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*$activeRoute*/ 8) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let $activeRoute;
    	let $location;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	let { path = "" } = $$props;
    	let { component = null } = $$props;
    	const { registerRoute, unregisterRoute, activeRoute } = getContext(ROUTER);
    	component_subscribe($$self, activeRoute, value => $$invalidate(3, $activeRoute = value));
    	const location = getContext(LOCATION);
    	component_subscribe($$self, location, value => $$invalidate(4, $location = value));

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

    	$$self.$$set = $$new_props => {
    		$$invalidate(13, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		if ("path" in $$new_props) $$invalidate(8, path = $$new_props.path);
    		if ("component" in $$new_props) $$invalidate(0, component = $$new_props.component);
    		if ("$$scope" in $$new_props) $$invalidate(9, $$scope = $$new_props.$$scope);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*$activeRoute*/ 8) {
    			 if ($activeRoute && $activeRoute.route === route) {
    				$$invalidate(1, routeParams = $activeRoute.params);
    			}
    		}

    		 {
    			const { path, component, ...rest } = $$props;
    			$$invalidate(2, routeProps = rest);
    		}
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		component,
    		routeParams,
    		routeProps,
    		$activeRoute,
    		$location,
    		activeRoute,
    		location,
    		route,
    		path,
    		$$scope,
    		slots
    	];
    }

    class Route extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { path: 8, component: 0 });
    	}
    }

    /* src/routes/Admin.svelte generated by Svelte v3.29.4 */

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[10] = list[i];
    	return child_ctx;
    }

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[13] = list[i];
    	return child_ctx;
    }

    function get_each_context_2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[16] = list[i].ticketNumber;
    	child_ctx[17] = list[i].nbVote;
    	return child_ctx;
    }

    // (141:6) {#each cumulatedVotes as { ticketNumber, nbVote }}
    function create_each_block_2(ctx) {
    	let p;
    	let t0_value = /*ticketNumber*/ ctx[16] + "";
    	let t0;
    	let t1;
    	let span;
    	let t2_value = /*nbVote*/ ctx[17] + "";
    	let t2;
    	let t3;

    	return {
    		c() {
    			p = element("p");
    			t0 = text(t0_value);
    			t1 = text(",\n          ");
    			span = element("span");
    			t2 = text(t2_value);
    			t3 = space();
    			this.h();
    		},
    		l(nodes) {
    			p = claim_element(nodes, "P", {});
    			var p_nodes = children(p);
    			t0 = claim_text(p_nodes, t0_value);
    			t1 = claim_text(p_nodes, ",\n          ");
    			span = claim_element(p_nodes, "SPAN", { class: true, style: true });
    			children(span).forEach(detach);
    			t2 = claim_text(p_nodes, t2_value);
    			t3 = claim_space(p_nodes);
    			p_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(span, "class", "votesBar svelte-1l62ik3");
    			set_style(span, "width", /*nbVote*/ ctx[17] * 300 / /*nbVotes*/ ctx[0] + "px");
    			set_style(span, "background-color", "hsl(" + /*nbVote*/ ctx[17] * 360 / /*nbVotes*/ ctx[0] + ", 100%, 50%)");
    		},
    		m(target, anchor) {
    			insert(target, p, anchor);
    			append(p, t0);
    			append(p, t1);
    			append(p, span);
    			append(p, t2);
    			append(p, t3);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*cumulatedVotes*/ 8 && t0_value !== (t0_value = /*ticketNumber*/ ctx[16] + "")) set_data(t0, t0_value);

    			if (dirty & /*cumulatedVotes, nbVotes*/ 9) {
    				set_style(span, "width", /*nbVote*/ ctx[17] * 300 / /*nbVotes*/ ctx[0] + "px");
    			}

    			if (dirty & /*cumulatedVotes, nbVotes*/ 9) {
    				set_style(span, "background-color", "hsl(" + /*nbVote*/ ctx[17] * 360 / /*nbVotes*/ ctx[0] + ", 100%, 50%)");
    			}

    			if (dirty & /*cumulatedVotes*/ 8 && t2_value !== (t2_value = /*nbVote*/ ctx[17] + "")) set_data(t2, t2_value);
    		},
    		d(detaching) {
    			if (detaching) detach(p);
    		}
    	};
    }

    // (170:10) {#if showArtists}
    function create_if_block_1$1(ctx) {
    	let each_1_anchor;
    	let each_value_1 = /*artists*/ ctx[4];
    	let each_blocks = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	return {
    		c() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		l(nodes) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].l(nodes);
    			}

    			each_1_anchor = empty();
    		},
    		m(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert(target, each_1_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*artists*/ 16) {
    				each_value_1 = /*artists*/ ctx[4];
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1(ctx, each_value_1, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block_1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_1.length;
    			}
    		},
    		d(detaching) {
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach(each_1_anchor);
    		}
    	};
    }

    // (171:12) {#each artists as artist}
    function create_each_block_1(ctx) {
    	let tr;
    	let td0;
    	let t0;
    	let t1_value = /*artist*/ ctx[13].ticketNumber + "";
    	let t1;
    	let t2;
    	let td1;
    	let t3;
    	let t4_value = /*artist*/ ctx[13].vote + "";
    	let t4;
    	let t5;

    	return {
    		c() {
    			tr = element("tr");
    			td0 = element("td");
    			t0 = text("N° de ticket: ");
    			t1 = text(t1_value);
    			t2 = space();
    			td1 = element("td");
    			t3 = text("Vote: ");
    			t4 = text(t4_value);
    			t5 = space();
    			this.h();
    		},
    		l(nodes) {
    			tr = claim_element(nodes, "TR", { class: true });
    			var tr_nodes = children(tr);
    			td0 = claim_element(tr_nodes, "TD", { class: true });
    			var td0_nodes = children(td0);
    			t0 = claim_text(td0_nodes, "N° de ticket: ");
    			t1 = claim_text(td0_nodes, t1_value);
    			td0_nodes.forEach(detach);
    			t2 = claim_space(tr_nodes);
    			td1 = claim_element(tr_nodes, "TD", { class: true });
    			var td1_nodes = children(td1);
    			t3 = claim_text(td1_nodes, "Vote: ");
    			t4 = claim_text(td1_nodes, t4_value);
    			td1_nodes.forEach(detach);
    			t5 = claim_space(tr_nodes);
    			tr_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(td0, "class", "svelte-1l62ik3");
    			attr(td1, "class", "svelte-1l62ik3");
    			attr(tr, "class", "svelte-1l62ik3");
    		},
    		m(target, anchor) {
    			insert(target, tr, anchor);
    			append(tr, td0);
    			append(td0, t0);
    			append(td0, t1);
    			append(tr, t2);
    			append(tr, td1);
    			append(td1, t3);
    			append(td1, t4);
    			append(tr, t5);
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(tr);
    		}
    	};
    }

    // (178:10) {#if showSpectators}
    function create_if_block$1(ctx) {
    	let each_1_anchor;
    	let each_value = /*spectators*/ ctx[5];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	return {
    		c() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		l(nodes) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].l(nodes);
    			}

    			each_1_anchor = empty();
    		},
    		m(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert(target, each_1_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*spectators*/ 32) {
    				each_value = /*spectators*/ ctx[5];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		d(detaching) {
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach(each_1_anchor);
    		}
    	};
    }

    // (179:12) {#each spectators as spectator}
    function create_each_block(ctx) {
    	let tr;
    	let td0;
    	let t0;
    	let t1_value = /*spectator*/ ctx[10].ticketNumber + "";
    	let t1;
    	let t2;
    	let td1;
    	let t3;
    	let t4_value = /*spectator*/ ctx[10].vote + "";
    	let t4;
    	let t5;

    	return {
    		c() {
    			tr = element("tr");
    			td0 = element("td");
    			t0 = text("N° de ticket: ");
    			t1 = text(t1_value);
    			t2 = space();
    			td1 = element("td");
    			t3 = text("Vote: ");
    			t4 = text(t4_value);
    			t5 = space();
    			this.h();
    		},
    		l(nodes) {
    			tr = claim_element(nodes, "TR", { class: true });
    			var tr_nodes = children(tr);
    			td0 = claim_element(tr_nodes, "TD", { class: true });
    			var td0_nodes = children(td0);
    			t0 = claim_text(td0_nodes, "N° de ticket: ");
    			t1 = claim_text(td0_nodes, t1_value);
    			td0_nodes.forEach(detach);
    			t2 = claim_space(tr_nodes);
    			td1 = claim_element(tr_nodes, "TD", { class: true });
    			var td1_nodes = children(td1);
    			t3 = claim_text(td1_nodes, "Vote: ");
    			t4 = claim_text(td1_nodes, t4_value);
    			td1_nodes.forEach(detach);
    			t5 = claim_space(tr_nodes);
    			tr_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(td0, "class", "svelte-1l62ik3");
    			attr(td1, "class", "svelte-1l62ik3");
    			attr(tr, "class", "svelte-1l62ik3");
    		},
    		m(target, anchor) {
    			insert(target, tr, anchor);
    			append(tr, td0);
    			append(td0, t0);
    			append(td0, t1);
    			append(tr, t2);
    			append(tr, td1);
    			append(td1, t3);
    			append(td1, t4);
    			append(tr, t5);
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(tr);
    		}
    	};
    }

    function create_fragment$2(ctx) {
    	let main;
    	let div0;
    	let h1;
    	let t0;
    	let t1;
    	let div4;
    	let h2;
    	let t2;
    	let t3;
    	let p;
    	let t4;
    	let strong;
    	let t5;
    	let t6;
    	let div1;
    	let t7;
    	let div2;
    	let label0;
    	let t8;
    	let t9;
    	let button0;
    	let t10;
    	let label1;
    	let t11;
    	let t12;
    	let button1;
    	let t13;
    	let h3;
    	let t14;
    	let t15;
    	let div3;
    	let table;
    	let tbody;
    	let t16;
    	let mounted;
    	let dispose;
    	let each_value_2 = /*cumulatedVotes*/ ctx[3];
    	let each_blocks = [];

    	for (let i = 0; i < each_value_2.length; i += 1) {
    		each_blocks[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
    	}

    	let if_block0 = /*showArtists*/ ctx[1] && create_if_block_1$1(ctx);
    	let if_block1 = /*showSpectators*/ ctx[2] && create_if_block$1(ctx);

    	return {
    		c() {
    			main = element("main");
    			div0 = element("div");
    			h1 = element("h1");
    			t0 = text("Talents du Nord");
    			t1 = space();
    			div4 = element("div");
    			h2 = element("h2");
    			t2 = text("Administration");
    			t3 = space();
    			p = element("p");
    			t4 = text("Nombre de votes : ");
    			strong = element("strong");
    			t5 = text(/*nbVotes*/ ctx[0]);
    			t6 = space();
    			div1 = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t7 = space();
    			div2 = element("div");
    			label0 = element("label");
    			t8 = text("Artistes");
    			t9 = space();
    			button0 = element("button");
    			t10 = space();
    			label1 = element("label");
    			t11 = text("Spectateurs");
    			t12 = space();
    			button1 = element("button");
    			t13 = space();
    			h3 = element("h3");
    			t14 = text("Votes");
    			t15 = space();
    			div3 = element("div");
    			table = element("table");
    			tbody = element("tbody");
    			if (if_block0) if_block0.c();
    			t16 = space();
    			if (if_block1) if_block1.c();
    			this.h();
    		},
    		l(nodes) {
    			main = claim_element(nodes, "MAIN", { class: true });
    			var main_nodes = children(main);
    			div0 = claim_element(main_nodes, "DIV", { class: true });
    			var div0_nodes = children(div0);
    			h1 = claim_element(div0_nodes, "H1", { class: true });
    			var h1_nodes = children(h1);
    			t0 = claim_text(h1_nodes, "Talents du Nord");
    			h1_nodes.forEach(detach);
    			div0_nodes.forEach(detach);
    			t1 = claim_space(main_nodes);
    			div4 = claim_element(main_nodes, "DIV", { class: true });
    			var div4_nodes = children(div4);
    			h2 = claim_element(div4_nodes, "H2", { class: true });
    			var h2_nodes = children(h2);
    			t2 = claim_text(h2_nodes, "Administration");
    			h2_nodes.forEach(detach);
    			t3 = claim_space(div4_nodes);
    			p = claim_element(div4_nodes, "P", {});
    			var p_nodes = children(p);
    			t4 = claim_text(p_nodes, "Nombre de votes : ");
    			strong = claim_element(p_nodes, "STRONG", {});
    			var strong_nodes = children(strong);
    			t5 = claim_text(strong_nodes, /*nbVotes*/ ctx[0]);
    			strong_nodes.forEach(detach);
    			p_nodes.forEach(detach);
    			t6 = claim_space(div4_nodes);
    			div1 = claim_element(div4_nodes, "DIV", {});
    			var div1_nodes = children(div1);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].l(div1_nodes);
    			}

    			div1_nodes.forEach(detach);
    			t7 = claim_space(div4_nodes);
    			div2 = claim_element(div4_nodes, "DIV", { class: true });
    			var div2_nodes = children(div2);
    			label0 = claim_element(div2_nodes, "LABEL", { for: true });
    			var label0_nodes = children(label0);
    			t8 = claim_text(label0_nodes, "Artistes");
    			label0_nodes.forEach(detach);
    			t9 = claim_space(div2_nodes);
    			button0 = claim_element(div2_nodes, "BUTTON", { type: true, style: true, class: true });
    			children(button0).forEach(detach);
    			t10 = claim_space(div2_nodes);
    			label1 = claim_element(div2_nodes, "LABEL", { for: true, style: true });
    			var label1_nodes = children(label1);
    			t11 = claim_text(label1_nodes, "Spectateurs");
    			label1_nodes.forEach(detach);
    			t12 = claim_space(div2_nodes);
    			button1 = claim_element(div2_nodes, "BUTTON", { style: true, type: true, class: true });
    			children(button1).forEach(detach);
    			div2_nodes.forEach(detach);
    			t13 = claim_space(div4_nodes);
    			h3 = claim_element(div4_nodes, "H3", { class: true });
    			var h3_nodes = children(h3);
    			t14 = claim_text(h3_nodes, "Votes");
    			h3_nodes.forEach(detach);
    			t15 = claim_space(div4_nodes);
    			div3 = claim_element(div4_nodes, "DIV", { class: true });
    			var div3_nodes = children(div3);
    			table = claim_element(div3_nodes, "TABLE", {});
    			var table_nodes = children(table);
    			tbody = claim_element(table_nodes, "TBODY", {});
    			var tbody_nodes = children(tbody);
    			if (if_block0) if_block0.l(tbody_nodes);
    			t16 = claim_space(tbody_nodes);
    			if (if_block1) if_block1.l(tbody_nodes);
    			tbody_nodes.forEach(detach);
    			table_nodes.forEach(detach);
    			div3_nodes.forEach(detach);
    			div4_nodes.forEach(detach);
    			main_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(h1, "class", "svelte-1l62ik3");
    			attr(div0, "class", "titleContainer svelte-1l62ik3");
    			attr(h2, "class", "svelte-1l62ik3");
    			attr(label0, "for", "artists");
    			attr(button0, "type", "checkbox");
    			set_style(button0, "margin-right", "30px");
    			set_style(button0, "background-color", /*showArtists*/ ctx[1] ? "rgb(39,9,55)" : "#ffde59");
    			attr(button0, "class", "svelte-1l62ik3");
    			attr(label1, "for", "spectators");
    			set_style(label1, "margin-left", "30px");
    			set_style(button1, "background-color", /*showSpectators*/ ctx[2] ? "rgb(39,9,55)" : "#ffde59");
    			attr(button1, "type", "checkbox");
    			attr(button1, "class", "svelte-1l62ik3");
    			attr(div2, "class", "filterCategories svelte-1l62ik3");
    			attr(h3, "class", "svelte-1l62ik3");
    			attr(div3, "class", "tableWrapper svelte-1l62ik3");
    			attr(div4, "class", "mainContainer svelte-1l62ik3");
    			attr(main, "class", "svelte-1l62ik3");
    		},
    		m(target, anchor) {
    			insert(target, main, anchor);
    			append(main, div0);
    			append(div0, h1);
    			append(h1, t0);
    			append(main, t1);
    			append(main, div4);
    			append(div4, h2);
    			append(h2, t2);
    			append(div4, t3);
    			append(div4, p);
    			append(p, t4);
    			append(p, strong);
    			append(strong, t5);
    			append(div4, t6);
    			append(div4, div1);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div1, null);
    			}

    			append(div4, t7);
    			append(div4, div2);
    			append(div2, label0);
    			append(label0, t8);
    			append(div2, t9);
    			append(div2, button0);
    			append(div2, t10);
    			append(div2, label1);
    			append(label1, t11);
    			append(div2, t12);
    			append(div2, button1);
    			append(div4, t13);
    			append(div4, h3);
    			append(h3, t14);
    			append(div4, t15);
    			append(div4, div3);
    			append(div3, table);
    			append(table, tbody);
    			if (if_block0) if_block0.m(tbody, null);
    			append(tbody, t16);
    			if (if_block1) if_block1.m(tbody, null);

    			if (!mounted) {
    				dispose = [
    					listen(button0, "click", /*click_handler*/ ctx[6]),
    					listen(button1, "click", /*click_handler_1*/ ctx[7])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*nbVotes*/ 1) set_data(t5, /*nbVotes*/ ctx[0]);

    			if (dirty & /*cumulatedVotes, nbVotes*/ 9) {
    				each_value_2 = /*cumulatedVotes*/ ctx[3];
    				let i;

    				for (i = 0; i < each_value_2.length; i += 1) {
    					const child_ctx = get_each_context_2(ctx, each_value_2, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block_2(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div1, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_2.length;
    			}

    			if (dirty & /*showArtists*/ 2) {
    				set_style(button0, "background-color", /*showArtists*/ ctx[1] ? "rgb(39,9,55)" : "#ffde59");
    			}

    			if (dirty & /*showSpectators*/ 4) {
    				set_style(button1, "background-color", /*showSpectators*/ ctx[2] ? "rgb(39,9,55)" : "#ffde59");
    			}

    			if (/*showArtists*/ ctx[1]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_1$1(ctx);
    					if_block0.c();
    					if_block0.m(tbody, t16);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (/*showSpectators*/ ctx[2]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block$1(ctx);
    					if_block1.c();
    					if_block1.m(tbody, null);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(main);
    			destroy_each(each_blocks, detaching);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let nbVotes;
    	let showArtists = true;
    	let showSpectators = true;

    	let artists = [
    		{ ticketNumber: 15, vote: 13 },
    		{ ticketNumber: 24, vote: 18 },
    		{ ticketNumber: 35, vote: 13 },
    		{ ticketNumber: 7, vote: 22 },
    		{ ticketNumber: 47, vote: 17 },
    		{ ticketNumber: 58, vote: 18 },
    		{ ticketNumber: 4, vote: 13 }
    	];

    	let spectators = [
    		{ ticketNumber: 15, vote: 12 },
    		{ ticketNumber: 24, vote: 18 },
    		{ ticketNumber: 35, vote: 12 },
    		{ ticketNumber: 7, vote: 22 },
    		{ ticketNumber: 47, vote: 17 },
    		{ ticketNumber: 58, vote: 18 },
    		{ ticketNumber: 4, vote: 12 }
    	];

    	let cumulatedVotes = [];
    	let votesTicketNumbers = [];

    	function getCumulatedVotes(voters) {
    		voters.forEach(({ vote }) => {
    			if (votesTicketNumbers.indexOf(vote) === -1) {
    				votesTicketNumbers.push(vote);
    				$$invalidate(3, cumulatedVotes = [...cumulatedVotes, { ticketNumber: vote, nbVote: 1 }]);
    			} else {
    				let artist = cumulatedVotes.find(votes => votes.ticketNumber === vote);
    				artist.nbVote++;
    			}
    		});
    	}

    	onMount(() => {
    		getCumulatedVotes(artists);
    		getCumulatedVotes(spectators);
    		$$invalidate(0, nbVotes = artists.length + spectators.length);
    	});

    	const click_handler = () => $$invalidate(1, showArtists = !showArtists);
    	const click_handler_1 = () => $$invalidate(2, showSpectators = !showSpectators);

    	return [
    		nbVotes,
    		showArtists,
    		showSpectators,
    		cumulatedVotes,
    		artists,
    		spectators,
    		click_handler,
    		click_handler_1
    	];
    }

    class Admin extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, {});
    	}
    }

    /* src/routes/Home.svelte generated by Svelte v3.29.4 */

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[3] = list[i];
    	return child_ctx;
    }

    function get_each_context_1$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[6] = list[i];
    	return child_ctx;
    }

    // (130:10) {#each categories as categorie}
    function create_each_block_1$1(ctx) {
    	let option;
    	let t_value = /*categorie*/ ctx[6] + "";
    	let t;
    	let option_value_value;

    	return {
    		c() {
    			option = element("option");
    			t = text(t_value);
    			this.h();
    		},
    		l(nodes) {
    			option = claim_element(nodes, "OPTION", { value: true });
    			var option_nodes = children(option);
    			t = claim_text(option_nodes, t_value);
    			option_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			option.__value = option_value_value = /*categorie*/ ctx[6];
    			option.value = option.__value;
    		},
    		m(target, anchor) {
    			insert(target, option, anchor);
    			append(option, t);
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(option);
    		}
    	};
    }

    // (141:8) {#each artists as artist}
    function create_each_block$1(ctx) {
    	let option;
    	let t_value = /*artist*/ ctx[3] + "";
    	let t;
    	let option_value_value;

    	return {
    		c() {
    			option = element("option");
    			t = text(t_value);
    			this.h();
    		},
    		l(nodes) {
    			option = claim_element(nodes, "OPTION", { value: true });
    			var option_nodes = children(option);
    			t = claim_text(option_nodes, t_value);
    			option_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			option.__value = option_value_value = /*artist*/ ctx[3];
    			option.value = option.__value;
    		},
    		m(target, anchor) {
    			insert(target, option, anchor);
    			append(option, t);
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(option);
    		}
    	};
    }

    function create_fragment$3(ctx) {
    	let main;
    	let div0;
    	let h1;
    	let t0;
    	let t1;
    	let div2;
    	let h2;
    	let t2;
    	let t3;
    	let form;
    	let div1;
    	let label0;
    	let t4;
    	let t5;
    	let select0;
    	let t6;
    	let label1;
    	let t7;
    	let t8;
    	let input;
    	let t9;
    	let label2;
    	let t10;
    	let t11;
    	let select1;
    	let t12;
    	let button;
    	let t13;
    	let each_value_1 = /*categories*/ ctx[1];
    	let each_blocks_1 = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks_1[i] = create_each_block_1$1(get_each_context_1$1(ctx, each_value_1, i));
    	}

    	let each_value = /*artists*/ ctx[2];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
    	}

    	return {
    		c() {
    			main = element("main");
    			div0 = element("div");
    			h1 = element("h1");
    			t0 = text("Talents du Nord");
    			t1 = space();
    			div2 = element("div");
    			h2 = element("h2");
    			t2 = text("TDN-12 Novembre 2020");
    			t3 = space();
    			form = element("form");
    			div1 = element("div");
    			label0 = element("label");
    			t4 = text("Catégorie");
    			t5 = space();
    			select0 = element("select");

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].c();
    			}

    			t6 = space();
    			label1 = element("label");
    			t7 = text("N° de place");
    			t8 = space();
    			input = element("input");
    			t9 = space();
    			label2 = element("label");
    			t10 = text("N° du gagnant");
    			t11 = space();
    			select1 = element("select");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t12 = space();
    			button = element("button");
    			t13 = text("Voter");
    			this.h();
    		},
    		l(nodes) {
    			main = claim_element(nodes, "MAIN", {});
    			var main_nodes = children(main);
    			div0 = claim_element(main_nodes, "DIV", { class: true });
    			var div0_nodes = children(div0);
    			h1 = claim_element(div0_nodes, "H1", { class: true });
    			var h1_nodes = children(h1);
    			t0 = claim_text(h1_nodes, "Talents du Nord");
    			h1_nodes.forEach(detach);
    			div0_nodes.forEach(detach);
    			t1 = claim_space(main_nodes);
    			div2 = claim_element(main_nodes, "DIV", { class: true });
    			var div2_nodes = children(div2);
    			h2 = claim_element(div2_nodes, "H2", { class: true });
    			var h2_nodes = children(h2);
    			t2 = claim_text(h2_nodes, "TDN-12 Novembre 2020");
    			h2_nodes.forEach(detach);
    			t3 = claim_space(div2_nodes);
    			form = claim_element(div2_nodes, "FORM", { class: true });
    			var form_nodes = children(form);
    			div1 = claim_element(form_nodes, "DIV", { class: true, style: true });
    			var div1_nodes = children(div1);
    			label0 = claim_element(div1_nodes, "LABEL", { for: true, class: true });
    			var label0_nodes = children(label0);
    			t4 = claim_text(label0_nodes, "Catégorie");
    			label0_nodes.forEach(detach);
    			t5 = claim_space(div1_nodes);
    			select0 = claim_element(div1_nodes, "SELECT", { name: true, id: true, class: true });
    			var select0_nodes = children(select0);

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].l(select0_nodes);
    			}

    			select0_nodes.forEach(detach);
    			t6 = claim_space(div1_nodes);
    			label1 = claim_element(div1_nodes, "LABEL", { for: true, class: true });
    			var label1_nodes = children(label1);
    			t7 = claim_text(label1_nodes, "N° de place");
    			label1_nodes.forEach(detach);
    			t8 = claim_space(div1_nodes);

    			input = claim_element(div1_nodes, "INPUT", {
    				name: true,
    				id: true,
    				type: true,
    				class: true
    			});

    			div1_nodes.forEach(detach);
    			t9 = claim_space(form_nodes);
    			label2 = claim_element(form_nodes, "LABEL", { for: true, style: true, class: true });
    			var label2_nodes = children(label2);
    			t10 = claim_text(label2_nodes, "N° du gagnant");
    			label2_nodes.forEach(detach);
    			t11 = claim_space(form_nodes);
    			select1 = claim_element(form_nodes, "SELECT", { name: true, id: true, class: true });
    			var select1_nodes = children(select1);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].l(select1_nodes);
    			}

    			select1_nodes.forEach(detach);
    			t12 = claim_space(form_nodes);
    			button = claim_element(form_nodes, "BUTTON", { type: true, class: true });
    			var button_nodes = children(button);
    			t13 = claim_text(button_nodes, "Voter");
    			button_nodes.forEach(detach);
    			form_nodes.forEach(detach);
    			div2_nodes.forEach(detach);
    			main_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(h1, "class", "svelte-ysnebd");
    			attr(div0, "class", "titleContainer svelte-ysnebd");
    			attr(h2, "class", "svelte-ysnebd");
    			attr(label0, "for", "ticketRole");
    			attr(label0, "class", "svelte-ysnebd");
    			attr(select0, "name", "ticketRole");
    			attr(select0, "id", "ticketRole");
    			attr(select0, "class", "svelte-ysnebd");
    			attr(label1, "for", "ticketNumber");
    			attr(label1, "class", "svelte-ysnebd");
    			attr(input, "name", "ticketNumber");
    			attr(input, "id", "ticketNumber");
    			attr(input, "type", "number");
    			attr(input, "class", "svelte-ysnebd");
    			attr(div1, "class", "ticket svelte-ysnebd");
    			set_style(div1, "flex-direction", /*ticketDirection*/ ctx[0]);
    			attr(label2, "for", "vote");
    			set_style(label2, "align-self", "start");
    			attr(label2, "class", "svelte-ysnebd");
    			attr(select1, "name", "vote");
    			attr(select1, "id", "vote");
    			attr(select1, "class", "svelte-ysnebd");
    			attr(button, "type", "submit");
    			attr(button, "class", "svelte-ysnebd");
    			attr(form, "class", "svelte-ysnebd");
    			attr(div2, "class", "mainContainer svelte-ysnebd");
    		},
    		m(target, anchor) {
    			insert(target, main, anchor);
    			append(main, div0);
    			append(div0, h1);
    			append(h1, t0);
    			append(main, t1);
    			append(main, div2);
    			append(div2, h2);
    			append(h2, t2);
    			append(div2, t3);
    			append(div2, form);
    			append(form, div1);
    			append(div1, label0);
    			append(label0, t4);
    			append(div1, t5);
    			append(div1, select0);

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].m(select0, null);
    			}

    			append(div1, t6);
    			append(div1, label1);
    			append(label1, t7);
    			append(div1, t8);
    			append(div1, input);
    			append(form, t9);
    			append(form, label2);
    			append(label2, t10);
    			append(form, t11);
    			append(form, select1);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(select1, null);
    			}

    			append(form, t12);
    			append(form, button);
    			append(button, t13);
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*categories*/ 2) {
    				each_value_1 = /*categories*/ ctx[1];
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1$1(ctx, each_value_1, i);

    					if (each_blocks_1[i]) {
    						each_blocks_1[i].p(child_ctx, dirty);
    					} else {
    						each_blocks_1[i] = create_each_block_1$1(child_ctx);
    						each_blocks_1[i].c();
    						each_blocks_1[i].m(select0, null);
    					}
    				}

    				for (; i < each_blocks_1.length; i += 1) {
    					each_blocks_1[i].d(1);
    				}

    				each_blocks_1.length = each_value_1.length;
    			}

    			if (dirty & /*ticketDirection*/ 1) {
    				set_style(div1, "flex-direction", /*ticketDirection*/ ctx[0]);
    			}

    			if (dirty & /*artists*/ 4) {
    				each_value = /*artists*/ ctx[2];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$1(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(select1, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(main);
    			destroy_each(each_blocks_1, detaching);
    			destroy_each(each_blocks, detaching);
    		}
    	};
    }

    function instance$3($$self, $$props, $$invalidate) {
    	const categories = ["Spectateur", "Artiste"];
    	const artists = [];
    	let ticketDirection;

    	onMount(() => {
    		$$invalidate(0, ticketDirection = window.innerHeight > window.innerWidth
    		? "column"
    		: "row");
    	});

    	return [ticketDirection, categories, artists];
    }

    class Home extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, {});
    	}
    }

    /* src/routes/Login.svelte generated by Svelte v3.29.4 */

    function create_fragment$4(ctx) {
    	let main;
    	let h1;
    	let t;

    	return {
    		c() {
    			main = element("main");
    			h1 = element("h1");
    			t = text("Login");
    		},
    		l(nodes) {
    			main = claim_element(nodes, "MAIN", {});
    			var main_nodes = children(main);
    			h1 = claim_element(main_nodes, "H1", {});
    			var h1_nodes = children(h1);
    			t = claim_text(h1_nodes, "Login");
    			h1_nodes.forEach(detach);
    			main_nodes.forEach(detach);
    		},
    		m(target, anchor) {
    			insert(target, main, anchor);
    			append(main, h1);
    			append(h1, t);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(main);
    		}
    	};
    }

    class Login extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, null, create_fragment$4, safe_not_equal, {});
    	}
    }

    /* src/App.svelte generated by Svelte v3.29.4 */

    function create_default_slot(ctx) {
    	let route0;
    	let t0;
    	let route1;
    	let t1;
    	let route2;
    	let current;

    	route0 = new Route({
    			props: { path: "login", component: Login }
    		});

    	route1 = new Route({
    			props: { path: "admin", component: Admin }
    		});

    	route2 = new Route({ props: { path: "/", component: Home } });

    	return {
    		c() {
    			create_component(route0.$$.fragment);
    			t0 = space();
    			create_component(route1.$$.fragment);
    			t1 = space();
    			create_component(route2.$$.fragment);
    		},
    		l(nodes) {
    			claim_component(route0.$$.fragment, nodes);
    			t0 = claim_space(nodes);
    			claim_component(route1.$$.fragment, nodes);
    			t1 = claim_space(nodes);
    			claim_component(route2.$$.fragment, nodes);
    		},
    		m(target, anchor) {
    			mount_component(route0, target, anchor);
    			insert(target, t0, anchor);
    			mount_component(route1, target, anchor);
    			insert(target, t1, anchor);
    			mount_component(route2, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i(local) {
    			if (current) return;
    			transition_in(route0.$$.fragment, local);
    			transition_in(route1.$$.fragment, local);
    			transition_in(route2.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(route0.$$.fragment, local);
    			transition_out(route1.$$.fragment, local);
    			transition_out(route2.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(route0, detaching);
    			if (detaching) detach(t0);
    			destroy_component(route1, detaching);
    			if (detaching) detach(t1);
    			destroy_component(route2, detaching);
    		}
    	};
    }

    function create_fragment$5(ctx) {
    	let router;
    	let current;

    	router = new Router({
    			props: {
    				url: /*url*/ ctx[0],
    				$$slots: { default: [create_default_slot] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(router.$$.fragment);
    		},
    		l(nodes) {
    			claim_component(router.$$.fragment, nodes);
    		},
    		m(target, anchor) {
    			mount_component(router, target, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const router_changes = {};
    			if (dirty & /*url*/ 1) router_changes.url = /*url*/ ctx[0];

    			if (dirty & /*$$scope*/ 2) {
    				router_changes.$$scope = { dirty, ctx };
    			}

    			router.$set(router_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(router.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(router.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(router, detaching);
    		}
    	};
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let { url = "" } = $$props;

    	$$self.$$set = $$props => {
    		if ("url" in $$props) $$invalidate(0, url = $$props.url);
    	};

    	return [url];
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$4, create_fragment$5, safe_not_equal, { url: 0 });
    	}
    }

    const app = new App({
      target: document.body,
      hydrate: true,
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
