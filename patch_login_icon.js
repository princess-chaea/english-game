const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'index.html');
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(
    'showAlert("영혼에 각인된 영웅을 찾을 수 없습니다.<br>기존 로그인 후 설정에서 구글 계정을 연동해주세요.", "alert-triangle", "연동 계정 없음");',
    'showAlert("영혼에 각인된 영웅을 찾을 수 없습니다.<br>기존 로그인 후 설정에서 구글 계정을 연동해주세요.", "⚠️", "연동 계정 없음");'
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ Icon fixed');
