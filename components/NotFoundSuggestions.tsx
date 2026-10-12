import { pickSlugMatch } from '@/lib/slug-match';

/**
 * Recovers readers who land on a misspelt article URL: forwards them when the
 * intended post is unmistakable, otherwise offers the closest few.
 *
 * This is a plain inline script, not a client component. Importing a client
 * component into app/not-found breaks the static export of /404 in this
 * version of Next ("<Html> should not be imported outside of
 * pages/_document"). The page still returns 404 to crawlers, so nothing wrong
 * is indexed — this only helps the person who clicked.
 */
const SCRIPT = `(function () {
  var m = location.pathname.match(/^\\/(?:blogs?|dev\\/blog)\\/(?:[^/]+\\/)*?([^/]+)\\/?$/);
  if (!m) return;
  var wanted = decodeURIComponent(m[1]);
  var pick = ${pickSlugMatch.toString()};
  fetch('/blogs-search-index.json')
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (index) {
      var titles = {};
      index.forEach(function (e) { titles[e.slug] = e.title; });
      var res = pick(wanted, index.map(function (e) { return e.slug; }));
      if (res.forward) {
        var status = document.getElementById('nf-forward');
        if (status) {
          status.textContent = 'Taking you to \\u201c' + (titles[res.forward] || res.forward) + '\\u201d\\u2026';
          status.hidden = false;
        }
        location.replace('/blogs/' + res.forward + '/');
        return;
      }
      if (!res.suggest.length) return;
      var list = document.getElementById('nf-suggest-list');
      var box = document.getElementById('nf-suggest');
      if (!list || !box) return;
      res.suggest.forEach(function (slug) {
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.href = '/blogs/' + slug + '/';
        a.textContent = titles[slug] || slug;
        a.className = 'text-base text-[#ED7428] underline-offset-2 hover:underline';
        li.appendChild(a);
        list.appendChild(li);
      });
      box.hidden = false;
    })
    .catch(function () {});
})();`;

export default function NotFoundSuggestions() {
  return (
    <>
      <p id="nf-forward" role="status" hidden className="mb-8 max-w-md text-base text-[#486364]" />
      <div id="nf-suggest" hidden className="mb-10 w-full max-w-xl rounded-2xl bg-white p-5 text-left shadow-sm">
        <p className="text-sm font-semibold text-[#00373E]">Were you looking for one of these?</p>
        <ul id="nf-suggest-list" className="mt-3 space-y-2" />
      </div>
      <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
    </>
  );
}
