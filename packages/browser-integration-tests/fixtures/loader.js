!function(n,e,t,r,a,i,o,c,_,f){for(var p=f,forceLoad=!1,s=0;s<document.scripts.length;s++)if(document.scripts[s].src.indexOf(o)>-1){p&&"no"===document.scripts[s].getAttribute("data-lazy")&&(p=!1);break}var u=!1,l=[],d=function(n){("e"in n||"p"in n||n.f&&n.f.indexOf("capture")>-1||n.f&&n.f.indexOf("showReportDialog")>-1)&&p&&R(l),d.data.push(n)};function R(o){if(!u){u=!0;var f=e.scripts[0],p=e.createElement(t);p.src=c,p.crossOrigin="anonymous",p.addEventListener("load",(function(){try{n[r]&&n[r].__SENTRY_LOADER__&&(n[r]=E),n[a]&&n[a].__SENTRY_LOADER__&&(n[a]=O),n.SENTRY_SDK_SOURCE="loader";var e=n[i],t=e.init;e.init=function(n){var r=_;for(var a in n)Object.prototype.hasOwnProperty.call(n,a)&&(r[a]=n[a]);!function(n,e){var t=n.integrations||[],r=t.map((function(n){return n.name}));n.tracesSampleRate&&-1===r.indexOf("BrowserTracing")&&t.push(new e.BrowserTracing);(n.replaysSessionSampleRate||n.replaysOnErrorSampleRate)&&-1===r.indexOf("Replay")&&t.push(new e.Replay);n.integrations=t}(r,e),t(r)},function(e,t){try{for(var i=0;i<e.length;i++)"function"==typeof e[i]&&e[i]();var o=d.data,c=!(void 0===(u=n.__SENTRY__)||!u.hub||!u.hub.getClient());o.sort((function(n){return"init"===n.f?-1:0}));var _=!1;for(i=0;i<o.length;i++)if(o[i].f){_=!0;var f=o[i];!1===c&&"init"!==f.f&&t.init(),c=!0,t[f.f].apply(t,f.a)}!1===c&&!1===_&&t.init();var p=n[r],s=n[a];for(i=0;i<o.length;i++)"e"in o[i]&&p?p.apply(n,o[i].e):"p"in o[i]&&s&&s.apply(n,[o[i].p])}catch(n){console.error(n)}var u}(o,e)}catch(n){console.error(n)}})),f.parentNode.insertBefore(p,f)}}d.data=[],n[i]=n[i]||{},n[i].onLoad=function(n){l.push(n),p&&!forceLoad||R(l)},n[i].forceLoad=function(){forceLoad=!0,p&&setTimeout((function(){R(l)}))},["init","addBreadcrumb","captureMessage","captureException","captureEvent","configureScope","withScope","showReportDialog"].forEach((function(e){n[i][e]=function(){d({f:e,a:arguments})}}));var E=n[r];n[r]=function(){d({e:[].slice.call(arguments)}),E&&E.apply(n,arguments)},n[r].__SENTRY_LOADER__=!0;var O=n[a];n[a]=function(e){d({p:"reason"in e?e.reason:"detail"in e&&"reason"in e.detail?e.detail.reason:e}),O&&O.apply(n,arguments)},n[a].__SENTRY_LOADER__=!0,p||setTimeout((function(){R(l)}))}
(
  window,
  document,
  'script',
  'onerror',
  'onunhandledrejection',
  'Sentry',
  'loader.js',
  __LOADER_BUNDLE__,
  __LOADER_OPTIONS__,
  __LOADER_LAZY__
);
