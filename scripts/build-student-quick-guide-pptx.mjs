import fs from 'node:fs/promises';
import path from 'node:path';
import { Presentation, PresentationFile } from '@oai/artifact-tool';

const BACKGROUND_DIR = process.env.VOCA_STUDENT_PPT_BACKGROUND_DIR
  || 'C:\\tmp\\voca-student-ppt-backgrounds-final\\student-quick-guide-detailed';
const MANIFEST_FILE = path.join(BACKGROUND_DIR, 'manifest.json');
const OUTPUT_FILE = process.env.VOCA_STUDENT_PPT_OUTPUT
  || path.resolve('docs/promotion/student-quick-guide-editable.pptx');
const PREVIEW_DIR = process.env.VOCA_STUDENT_PPT_PREVIEW_DIR
  || 'C:\\tmp\\voca-student-ppt-preview';
const SLIDE_WIDTH = 1280;
const SLIDE_HEIGHT = 720;
const PIN_SIZE = 27;

async function readImage(pathname) {
  const bytes = await fs.readFile(pathname);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

async function writeBlob(pathname, blob) {
  await fs.writeFile(pathname, new Uint8Array(await blob.arrayBuffer()));
}

async function main() {
  const manifest = JSON.parse(await fs.readFile(MANIFEST_FILE, 'utf8'));
  const presentation = Presentation.create({ slideSize: { width: SLIDE_WIDTH, height: SLIDE_HEIGHT } });

  for (const page of manifest.pages) {
    const slide = presentation.slides.add();
    slide.background.fill = '#02030a';
    slide.images.add({
      blob: await readImage(path.join(BACKGROUND_DIR, page.file)),
      contentType: 'image/png',
      alt: `Voca Hero 학생 퀵가이드 ${page.index}쪽 배경`,
      fit: 'fill',
      position: { left: 0, top: 0, width: SLIDE_WIDTH, height: SLIDE_HEIGHT },
    });

    for (const annotation of page.annotations || []) {
      const pin = slide.shapes.add({
        geometry: 'ellipse',
        name: `화면 위치 번호 ${annotation.text}`,
        position: {
          left: annotation.x - PIN_SIZE / 2,
          top: annotation.y - PIN_SIZE / 2,
          width: PIN_SIZE,
          height: PIN_SIZE,
        },
        fill: '#E22718',
        line: { style: 'solid', fill: '#FFFFFF', width: 2 },
      });
      pin.text = annotation.text;
      pin.text.style = {
        typeface: 'Arial',
        fontSize: 15,
        bold: true,
        color: '#FFFFFF',
        alignment: 'center',
        verticalAlignment: 'middle',
        autoFit: 'shrinkText',
        insets: { left: 0, right: 0, top: 0, bottom: 0 },
      };
    }

    slide.speakerNotes.textFrame.setText([
      '편집 안내: 배경은 검수된 학생 퀵가이드 화면입니다.',
      '빨간 번호 원형은 독립 도형이므로 화면을 보며 원하는 위치로 드래그하세요.',
      '번호 크기와 색상은 복사 후 서식 복사로 통일할 수 있습니다.',
      '[Sources] Voca Hero 프로젝트 내부 화면 및 가이드 소스',
    ]);
  }

  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await fs.mkdir(PREVIEW_DIR, { recursive: true });
  const pptx = await PresentationFile.exportPptx(presentation);
  await pptx.save(OUTPUT_FILE);

  for (const pageNumber of manifest.pages.map((page) => page.index)) {
    const slide = presentation.slides.items[pageNumber - 1];
    await writeBlob(
      path.join(PREVIEW_DIR, `${String(pageNumber).padStart(3, '0')}.png`),
      await presentation.export({ slide, format: 'png', scale: 1 }),
    );
  }
  await writeBlob(
    path.join(PREVIEW_DIR, 'montage.webp'),
    await presentation.export({ format: 'webp', montage: true, scale: 0.25 }),
  );

  const inspection = await presentation.inspect({ kind: 'slide,shape,image,textbox,notes', maxChars: 20000 });
  await fs.writeFile(path.join(PREVIEW_DIR, 'inspection.ndjson'), inspection.ndjson, 'utf8');
  const editablePins = manifest.pages.reduce((sum, page) => sum + (page.annotations || []).length, 0);
  process.stdout.write(`${JSON.stringify({ output: OUTPUT_FILE, pages: manifest.pages.length, editablePins }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
