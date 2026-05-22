const test = require("node:test");
const assert = require("node:assert/strict");

const { decodeHtmlEntities, escapeHtml, sanitizeRubyMarkup } = require("../src/utils/text");

test("escapeHtml escapes text for HTML-rendered Anki fields", () => {
    assert.equal(
        escapeHtml(`<&>"'`),
        "&lt;&amp;&gt;&quot;&#39;"
    );
});

test("decodeHtmlEntities decodes one layer of Anki-visible escaped text", () => {
    assert.equal(
        decodeHtmlEntities("父 -&gt; とう &amp; &lt;tag&gt; &quot;quoted&quot; &#39;single&#39;"),
        "父 -> とう & <tag> \"quoted\" 'single'"
    );
    assert.equal(decodeHtmlEntities("&amp;gt;"), "&gt;");
});

test("sanitizeRubyMarkup preserves ruby tags and escapes everything else", () => {
    const result = sanitizeRubyMarkup('<ruby>悪<script><rt>あく"</rt></ruby><img src=x onerror=alert(1)>');

    assert.equal(
        result,
        '<ruby>悪&lt;script&gt;<rt>あく&quot;</rt></ruby>&lt;img src=x onerror=alert(1)&gt;'
    );
    assert.doesNotMatch(result, /<script|<img/iu);
});
