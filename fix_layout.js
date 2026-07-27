const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'index.html');
let content = fs.readFileSync(filePath, 'utf8');

// I will find the exact broken block and replace it with the correct full block.
// The broken block starts with `                    <!-- 계정 관리 -->` and ends before `<div class="border-t border-gray-800`

const startMarker = '                    <!-- 계정 관리 -->';
const endMarker = '            <div class="border-t border-gray-800 pt-3 flex justify-between gap-2 mt-2">';

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

if (startIndex !== -1 && endIndex !== -1) {
    const correctBlock = `                    <!-- 계정 관리 -->
                    <div class="bg-[#121216] p-3 border border-blue-900/40 space-y-2 mt-3 mb-3">
                        <h4 class="font-bold text-blue-300 text-[10px] uppercase tracking-wider mb-2 border-b border-gray-800 pb-1">🔐 계정 관리</h4>
                        <div class="flex flex-col gap-2">
                            <button onclick="linkGoogleAccount()" id="btnLinkGoogle" class="w-full py-2 bg-blue-900/50 hover:bg-blue-800 border border-blue-700 text-blue-300 font-bold text-[10px] rounded flex items-center justify-center gap-2 transition">
                                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" class="w-3 h-3" alt="Google">
                                <span>구글 계정 연동하기</span>
                            </button>
                            <div class="flex gap-2">
                                <button onclick="changeHeroName()" class="flex-1 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 font-bold text-[10px] rounded transition">
                                    영웅 닉네임 변경
                                </button>
                                <button onclick="changePinCode()" class="flex-1 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 font-bold text-[10px] rounded transition">
                                    PIN 암호 변경
                                </button>
                            </div>
                        </div>
                    </div>

`;
    
    // Also, there are some floating empty lines or broken </div> left over from the original location?
    // Let's check where it originally was. It was completely removed by my regex replace!
    // Wait, the regex `.*?<\/div>` only removed up to the first `</div>`. The REST of the original block is still in the original place!
    // Let's find it. It's above `<div class="border-t border-gray-800/60 pt-2">` (레벨업/획득)
    
}
