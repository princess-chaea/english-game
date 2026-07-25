const fs = require("fs");
let content = fs.readFileSync("index.html", "utf8");

const oldManualStart = "<span>스테이지를 등반할수록 <b>장신구(목걸이/팔찌/반지)</b>가 점차 해금되며, 모은 보스 증표로 <b>고대 유물</b>을 소환할 수 있습니다! (40 Stage <b>잠재력 연구소</b> 해금)</span>";
const newManual = `<div class="flex flex-col">
                                            <span>스테이지를 등반할수록 다음과 같이 콘텐츠가 점차 해금됩니다.</span>
                                            <span class="mt-0.5 text-[10px] text-gray-400">? 30스테이지: <b>고대 유물 소환 제단</b> 해금 (보스 증표 사용)</span>
                                            <span class="text-[10px] text-gray-400">? 40스테이지: <b>무구 잠재력 연구소</b> 해금</span>
                                            <span class="text-[10px] text-gray-400">? 50스테이지: <b>지혜의 목걸이</b> 연마 해금</span>
                                            <span class="text-[10px] text-gray-400">? 60스테이지: <b>투지의 팔찌</b> 연마 해금</span>
                                            <span class="text-[10px] text-gray-400">? 70스테이지: <b>영웅의 반지</b> 연마 해금</span>
                                        </div>`;
content = content.replace(oldManualStart, newManual);

const oldSkillPreview = `<span class="text-[10px] font-bold font-mono text-white truncate">\${capitalizeFirstLetter(s.word)}</span>\n                                </div>`;
const newSkillPreview = `<span class="text-[10px] font-bold font-mono text-white truncate">\${capitalizeFirstLetter(s.word)}</span>\n                                    <span class="text-[8px] font-bold text-[#bbbbbb]">배율 \${getSkillMultiplier(s)}%</span>\n                                </div>`;
content = content.replace(oldSkillPreview, newSkillPreview);

fs.writeFileSync("index.html", content, "utf8");
