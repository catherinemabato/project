!(function (n, e, r, t, i, o, a, c, s) {
  for (var u = s, f = 0; f < document.scripts.length; f++)
    if (document.scripts[f].src.indexOf(o) > -1) {
      u && 'no' === document.scripts[f].getAttribute('data-lazy') && (u = !1);
      break;
    }
  var p = [];
  function l(n) {
    return 'e' in n;
  }
  function d(n) {
    return 'p' in n;
  }
  function _(n) {
    return 'f' in n;
  }
  var v = [];
  function y(n) {
    u &&
      (l(n) || d(n) || (_(n) && n.f.indexOf('capture') > -1) || (_(n) && n.f.indexOf('showReportDialog') > -1)) &&
      m(),
      v.push(n);
  }
  function g() {
    y({ e: [].slice.call(arguments) });
  }
  function h(n) {
    y({ p: n });
  }
  function E() {
    try {
      n.SENTRY_SDK_SOURCE = 'loader';
      var e = n[i],
        o = e.init;
      (e.init = function (i) {
        n.removeEventListener(r, g), n.removeEventListener(t, h);
        var a = c;
        for (var s in i) Object.prototype.hasOwnProperty.call(i, s) && (a[s] = i[s]);
        !(function (n, e) {
          var r = n.integrations || [];
          if (!Array.isArray(r)) return;
          var t = r.map(function (n) {
            return n.name;
          });
          n.tracesSampleRate &&
            -1 === t.indexOf('BrowserTracing') &&
            (e.BrowserTracing
              ? r.push(new e.BrowserTracing())
              : e.browserTracingIntegration && r.push(e.browserTracingIntegration()));
          (n.replaysSessionSampleRate || n.replaysOnErrorSampleRate) &&
            -1 === t.indexOf('Replay') &&
            (e.Replay ? r.push(new e.Replay()) : e.replayIntegration && r.push(e.replayIntegration()));
          n.integrations = r;
        })(a, e),
          o(a);
      }),
        setTimeout(function () {
          return (function (e) {
            try {
              'function' == typeof n.sentryOnLoad && (n.sentryOnLoad(), (n.sentryOnLoad = void 0));
              for (var r = 0; r < p.length; r++) 'function' == typeof p[r] && p[r]();
              p.splice(0);
              for (r = 0; r < v.length; r++) {
                _((o = v[r])) && 'init' === o.f && e.init.apply(e, o.a);
              }
              L() || e.init();
              var t = n.onerror,
                i = n.onunhandledrejection;
              for (r = 0; r < v.length; r++) {
                var o;
                if (_((o = v[r]))) {
                  if ('init' === o.f) continue;
                  e[o.f].apply(e, o.a);
                } else l(o) && t ? t.apply(n, o.e) : d(o) && i && i.apply(n, [o.p]);
              }
            } catch (n) {
              console.error(n);
            }
          })(e);
        });
    } catch (n) {
      console.error(n);
    }
  }
  var O = !1;
  function m() {
    if (!O) {
      O = !0;
      var n = e.scripts[0],
        r = e.createElement('script');
      (r.src = a),
        (r.crossOrigin = 'anonymous'),
        r.addEventListener('load', E, { once: !0, passive: !0 }),
        n.parentNode.insertBefore(r, n);
    }
  }
  function L() {
    var e = n.__SENTRY__;

    // TODO: This is a temporary hack to make the loader script compatible with the versioned
    // carrier. This needs still needs to be added to the actual loader script before we
    // release the loader for v8!
    var v = e && e.version && e[e.version];

    return !(void 0 === e || !e.hub || !e.hub.getClient()) || !!v;
  }
  (n[i] = n[i] || {}),
    (n[i].onLoad = function (n) {
      L() ? n() : p.push(n);
    }),
    (n[i].forceLoad = function () {
      setTimeout(function () {
        m();
      });
    }),
    [
      'init',
      'addBreadcrumb',
      'captureMessage',
      'captureException',
      'captureEvent',
      'configureScope',
      'withScope',
      'showReportDialog',
    ].forEach(function (e) {
      n[i][e] = function () {
        y({ f: e, a: arguments });
      };
    }),
    n.addEventListener(r, g),
    n.addEventListener(t, h),
    u ||
      setTimeout(function () {
        m();
      });
})(
  window,
  document,
  'error',
  'unhandledrejection',
  'Sentry',
  'loader.js',
  __LOADER_BUNDLE__,
  __LOADER_OPTIONS__,
  __LOADER_LAZY__,
);
