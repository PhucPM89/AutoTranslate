"use strict";

const test = require("node:test");
const assert = require("node:assert");
const JSZip = require("jszip");

async function createSampleEpubBuffer(title, chapters) {
  const zip = new JSZip();

  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  );

  const manifestItems = [
    `<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`
  ];
  const spineItems = [];

  chapters.forEach((ch, idx) => {
    const fileId = `chapter_${idx + 1}`;
    const fileName = `chapter_${idx + 1}.xhtml`;
    manifestItems.push(`<item id="${fileId}" href="${fileName}" media-type="application/xhtml+xml"/>`);
    spineItems.push(`<itemref idref="${fileId}"/>`);

    zip.file(
      `OEBPS/${fileName}`,
      `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${ch.title}</title></head>
<body>
  <h1>${ch.title}</h1>
  <p>${ch.paragraphs.join("</p><p>")}</p>
</body>
</html>`
    );
  });

  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${title}</dc:title>
    <dc:language>zh-CN</dc:language>
  </metadata>
  <manifest>
    ${manifestItems.join("\n    ")}
  </manifest>
  <spine toc="ncx">
    ${spineItems.join("\n    ")}
  </spine>
</package>`
  );

  zip.file(
    "OEBPS/toc.ncx",
    `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <docTitle><text>${title}</text></docTitle>
  <navMap>
    ${chapters.map((ch, idx) => `
      <navPoint id="np_${idx + 1}" playOrder="${idx + 1}">
        <navLabel><text>${ch.title}</text></navLabel>
        <content src="chapter_${idx + 1}.xhtml"/>
      </navPoint>
    `).join("")}
  </navMap>
</ncx>`
  );

  return zip.generateAsync({ type: "nodebuffer" });
}

test("EPUB Studio parser extracts chapters and text accurately from EPUB buffer", async () => {
  const sampleChapters = [
    {
      title: "第一章 踏入仙门",
      paragraphs: ["天玄宗山门巍峨，云海缭绕。", "林尘仰望高台，目光坚定。"]
    },
    {
      title: "第二章 灵根测试",
      paragraphs: ["测试水晶光芒大盛，映照四方。", "天品雷灵根！全场震惊。"]
    }
  ];

  const buffer = await createSampleEpubBuffer("仙道至尊", sampleChapters);
  const zip = await JSZip.loadAsync(buffer);
  
  const containerXml = await zip.file("META-INF/container.xml").async("text");
  assert.ok(containerXml.includes("OEBPS/content.opf"));

  const opfXml = await zip.file("OEBPS/content.opf").async("text");
  assert.ok(opfXml.includes("仙道至尊"));
  assert.ok(opfXml.includes("chapter_1.xhtml"));
  assert.ok(opfXml.includes("chapter_2.xhtml"));

  const ch1Content = await zip.file("OEBPS/chapter_1.xhtml").async("text");
  assert.ok(ch1Content.includes("第一章 踏入仙门"));
  assert.ok(ch1Content.includes("天玄宗山门巍峨"));
});
