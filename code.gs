/**
 * Voca Hero! 영단어 용사 키우기 - Google Apps Script 백엔드 엔진
 * * [기능]
 * 1. doGet(e): 웹앱 진입점 핸들러 (index.html 파일 렌더링)
 * 2. initDatabaseSheets(): 워크시트가 없으면 자동으로 구조화하여 생성 및 포맷 설정
 * 3. getWordsFromSheet(grade): 교사가 등록한 단어 추출 (없을 시 학년별 자동 더미 단어 탑재)
 * 4. loadOrCreateStudent(...): 데이터베이스 검색 후 가입 및 이어하기 처리
 * 5. saveStudentProgress(...): 플레이어의 모든 RPG 진행 상황 및 스킬 슬롯 직렬화 저장
 */

// 1. 웹 앱 초기화 및 HTML 파일 서빙
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Voca Hero! 영단어 용사 키우기')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// 외부 배포(Vercel 등) API 허용을 위한 포스트 리퀘스트 리시버 (CORS 대응)
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action;
    var args = data.args || [];
    var result;
    
    if (action === "getWordsFromSheet") {
      result = getWordsFromSheet.apply(null, args);
    } else if (action === "checkStudentExists") {
      result = checkStudentExists.apply(null, args);
    } else if (action === "loadOrCreateStudent") {
      result = loadOrCreateStudent.apply(null, args);
    } else if (action === "saveStudentProgress") {
      result = saveStudentProgress.apply(null, args);
    } else if (action === "uploadWordsBatch") {
      result = uploadWordsBatch.apply(null, args);
    } else if (action === "getWorldBossStatus") {
      result = getWorldBossStatus.apply(null, args);
    } else if (action === "attackWorldBoss") {
      result = attackWorldBoss.apply(null, args);
    } else if (action === "getHallOfFame") {
      result = getHallOfFame.apply(null, args);
    } else {
      throw new Error("Unknown action: " + action);
    }
    
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// 2. 자동 시트 검사 및 테이블 자가 생성 장치 (핵심 요구사항)
function initDatabaseSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 2-1. Students (학생 성장 정보 데이터베이스) 검사 및 복구
  var studentSheet = ss.getSheetByName("Students");
  if (!studentSheet) {
    studentSheet = ss.insertSheet("Students");
    // 필요한 모든 백엔드 필드 정의 (19개 정돈된 표준 칼럼 구조)
    var studentHeaders = [
      "Grade", "Class", "Number", "Name", "Gold", 
      "AvatarType", "HelmetLvl", "ArmorLvl", "WeaponLvl", "ShieldLvl", "ShoesLvl", 
      "PetLevels", "Stage", "Progress", "LastSaved", 
      "SkillsInventory", "EquippedSkills", "Password", "MasteryPoints"
    ];
    studentSheet.appendRow(studentHeaders);
    
    // 헤더 시각 스타일링 적용 (교사의 가독성을 위한 포맷 설정)
    var headerRange = studentSheet.getRange(1, 1, 1, studentHeaders.length);
    headerRange.setBackground("#312e81") // 딥 인디고
               .setFontColor("#ffffff")
               .setFontWeight("bold")
               .setHorizontalAlignment("center");
    studentSheet.setFrozenRows(1);
  }

  // 2-2. Words (영단어 목록 테이블) 검사 및 기본 내장 단어 탑재
  var wordsSheet = ss.getSheetByName("Words");
  if (!wordsSheet) {
    wordsSheet = ss.insertSheet("Words");
    var wordHeaders = ["Grade", "Word", "Meaning"];
    wordsSheet.appendRow(wordHeaders);
    
    // 교사용 단어 테이블 헤더 디자인 설정
    var wordHeaderRange = wordsSheet.getRange(1, 1, 1, wordHeaders.length);
    wordHeaderRange.setBackground("#065f46") // 포레스트 그린
                   .setFontColor("#ffffff")
                   .setFontWeight("bold")
                   .setHorizontalAlignment("center");
    wordsSheet.setFrozenRows(1);

    // 최초 1회, 단어 데이터 자동 탑재 (교사가 직접 입력하기 전 자동 기능 보장)
    var defaultWords = [
      // 3학년 기본단어
      [3, "apple", "사과"], [3, "banana", "바나나"], [3, "pencil", "연필"], [3, "desk", "책상"], [3, "cat", "고양이"],
      [3, "dog", "개"], [3, "school", "학교"], [3, "friend", "친구"], [3, "mother", "어머니"], [3, "happy", "행복한"],
      // 4학년 기본단어
      [4, "doctor", "의사"], [4, "english", "영어"], [4, "orange", "오렌지"], [4, "window", "창문"], [4, "family", "가족"],
      [4, "summer", "여름"], [4, "winter", "겨울"], [4, "teacher", "선생님"], [4, "morning", "아침"], [4, "yellow", "노란색"],
      // 5학년 기본단어
      [5, "beautiful", "아름다운"], [5, "different", "다른"], [5, "important", "중요한"], [5, "remember", "기억하다"], [5, "tomorrow", "내일"],
      [5, "station", "역"], [5, "weather", "날씨"], [5, "subject", "과목"], [5, "country", "나라"], [5, "picture", "사진"],
      // 6학년 기본단어
      [6, "experience", "경험"], [6, "challenge", "도전"], [6, "environment", "환경"], [6, "volunteer", "자원봉사자"], [6, "information", "정보"],
      [6, "traditional", "전통적인"], [6, "international", "국제의"], [6, "language", "언어"], [6, "understand", "이해하다"], [6, "protect", "보호하다"]
    ];
    for (var i = 0; i < defaultWords.length; i++) {
      wordsSheet.appendRow(defaultWords[i]);
    }
  }

  // 2-3. WorldBoss (학년별 레이드 보스 상태 데이터베이스) 검사 및 생성
  var bossSheet = ss.getSheetByName("WorldBoss");
  if (!bossSheet) {
    bossSheet = ss.insertSheet("WorldBoss");
    var bossHeaders = ["Grade", "CurrentHP", "MaxHP", "LastUpdatedDate"];
    bossSheet.appendRow(bossHeaders);
    var bossHeaderRange = bossSheet.getRange(1, 1, 1, bossHeaders.length);
    bossHeaderRange.setBackground("#991b1b")
                   .setFontColor("#ffffff")
                   .setFontWeight("bold")
                   .setHorizontalAlignment("center");
    bossSheet.setFrozenRows(1);
    
    // 학년별 보스 기본 체력 10,000,000 탑재
    var defaultBosses = [
      [3, 10000000, 10000000, Date.now()],
      [4, 10000000, 10000000, Date.now()],
      [5, 10000000, 10000000, Date.now()],
      [6, 10000000, 10000000, Date.now()]
    ];
    for (var j = 0; j < defaultBosses.length; j++) {
      bossSheet.appendRow(defaultBosses[j]);
    }
  }

  // 2-4. WorldBossLog (학생 개별 레이드 기여도 로그)
  var logSheet = ss.getSheetByName("WorldBossLog");
  if (!logSheet) {
    logSheet = ss.insertSheet("WorldBossLog");
    var logHeaders = ["Grade", "StudentKey", "DamageDealt", "LastAttackDate"];
    logSheet.appendRow(logHeaders);
    var logHeaderRange = logSheet.getRange(1, 1, 1, logHeaders.length);
    logHeaderRange.setBackground("#7f1d1d")
                  .setFontColor("#ffffff")
                  .setFontWeight("bold")
                  .setHorizontalAlignment("center");
    logSheet.setFrozenRows(1);
  }
}

// 월드보스 상태 및 내 기여도 조회
function getWorldBossStatus(grade, studentKey) {
  initDatabaseSheets();
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var bossSheet = ss.getSheetByName("WorldBoss");
    var bossData = bossSheet.getDataRange().getValues();
    
    var curHp = 10000000;
    var maxHp = 10000000;
    
    for (var i = 1; i < bossData.length; i++) {
      if (String(bossData[i][0]) === String(grade)) {
        curHp = Number(bossData[i][1]);
        maxHp = Number(bossData[i][2]);
        break;
      }
    }
    
    // 학생 개인 기여도 계산
    var logSheet = ss.getSheetByName("WorldBossLog");
    var logData = logSheet.getDataRange().getValues();
    var myDamage = 0;
    var lastAttackDate = "";
    
    for (var k = 1; k < logData.length; k++) {
      if (String(logData[k][0]) === String(grade) && String(logData[k][1]) === String(studentKey)) {
        myDamage = Number(logData[k][2]);
        lastAttackDate = String(logData[k][3]);
        break;
      }
    }
    
    // 전체 해당 학년 유저 누적 데미지 합산
    var totalGradeDamage = maxHp - curHp;
    if (totalGradeDamage <= 0) totalGradeDamage = 1; // Prevent div by 0
    
    var sharePct = (myDamage / totalGradeDamage) * 100;
    
    // 오늘 도전 가능 여부 (대한민국 표준시 KST 날짜 비교: YYYY-MM-DD)
    var todayStr = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd");
    var canAttack = (lastAttackDate !== todayStr);
    
    return {
      success: true,
      curHp: curHp,
      maxHp: maxHp,
      myDamage: myDamage,
      sharePct: sharePct.toFixed(2),
      canAttack: canAttack
    };
  } catch(e) {
    return { error: e.toString() };
  }
}

// 월드보스 공격 가하기 (1일 1회 제약)
function attackWorldBoss(grade, studentKey, damageDealt) {
  initDatabaseSheets();
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var todayStr = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd");
    
    var logSheet = ss.getSheetByName("WorldBossLog");
    var logData = logSheet.getDataRange().getValues();
    var targetRow = -1;
    var currentMyDamage = 0;
    
    for (var k = 1; k < logData.length; k++) {
      if (String(logData[k][0]) === String(grade) && String(logData[k][1]) === String(studentKey)) {
        if (String(logData[k][3]) === todayStr) {
          return { success: false, message: "오늘 이미 월드보스 레이드에 참전하셨습니다! 내일 다시 도전하세요." };
        }
        targetRow = k + 1;
        currentMyDamage = Number(logData[k][2]);
        break;
      }
    }
    
    var newMyDamage = currentMyDamage + Number(damageDealt);
    if (targetRow > 0) {
      logSheet.getRange(targetRow, 3).setValue(newMyDamage);
      logSheet.getRange(targetRow, 4).setValue(todayStr);
    } else {
      logSheet.appendRow([grade, studentKey, newMyDamage, todayStr]);
    }
    
    // WorldBoss HP 감축
    var bossSheet = ss.getSheetByName("WorldBoss");
    var bossData = bossSheet.getDataRange().getValues();
    for (var i = 1; i < bossData.length; i++) {
      if (String(bossData[i][0]) === String(grade)) {
        var currentHp = Number(bossData[i][1]);
        var nextHp = Math.max(0, currentHp - Number(damageDealt));
        bossSheet.getRange(i + 1, 2).setValue(nextHp);
        bossSheet.getRange(i + 1, 4).setValue(Date.now());
        break;
      }
    }
    
    return { success: true, newMyDamage: newMyDamage };
  } catch(e) {
    return { error: e.toString() };
  }
}

// 명예의 전장 (Hall of Fame) 랭킹 시스템
function getHallOfFame(grade, studentKey) {
  initDatabaseSheets();
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var studentSheet = ss.getSheetByName("Students");
    var studentData = studentSheet.getDataRange().getValues();
    
    var stageRankList = [];
    var goldRankList = [];
    
    // Students 필드 탐색: Grade(0), Class(1), Number(2), Name(3), Gold(4), Stage(12), Progress(13)
    for (var i = 1; i < studentData.length; i++) {
      var sGrade = String(studentData[i][0]);
      if (sGrade === String(grade)) {
        var sClass = studentData[i][1];
        var sNum = studentData[i][2];
        var sName = studentData[i][3];
        var sGold = Number(studentData[i][4]) || 0;
        var sStage = Number(studentData[i][12]) || 1;
        var sProg = Number(studentData[i][13]) || 0;
        var key = sGrade + "_" + sClass + "_" + sNum + "_" + sName;
        var displayName = sClass + "반 " + sName;
        
        stageRankList.push({
          key: key,
          name: displayName,
          stage: sStage,
          progress: sProg,
          score: (sStage * 100) + sProg
        });
        
        goldRankList.push({
          key: key,
          name: displayName,
          gold: sGold
        });
      }
    }
    
    // 1. 최고 스테이지 랭킹 내림차순
    stageRankList.sort(function(a, b) { return b.score - a.score; });
    
    // 2. 보유 골드 랭킹 내림차순
    goldRankList.sort(function(a, b) { return b.gold - a.gold; });
    
    // 3. 월드보스 타격 피해량 랭킹 (WorldBossLog 시트)
    var bossLogSheet = ss.getSheetByName("WorldBossLog");
    var bossLogData = bossLogSheet.getDataRange().getValues();
    var bossRankList = [];
    
    for (var k = 1; k < bossLogData.length; k++) {
      if (String(bossLogData[k][0]) === String(grade)) {
        var bKey = String(bossLogData[k][1]);
        var bParts = bKey.split("_");
        var bName = (bParts.length >= 4) ? (bParts[1] + "반 " + bParts[3]) : bKey;
        var bDmg = Number(bossLogData[k][2]) || 0;
        
        bossRankList.push({
          key: bKey,
          name: bName,
          damage: bDmg
        });
      }
    }
    bossRankList.sort(function(a, b) { return b.damage - a.damage; });
    
    // 내 순위 계산 함수
    function findMyRank(list, myKey) {
      for (var idx = 0; idx < list.length; idx++) {
        if (list[idx].key === myKey) {
          return idx + 1;
        }
      }
      return "-";
    }
    
    return {
      success: true,
      stageTop5: stageRankList.slice(0, 10),
      myStageRank: findMyRank(stageRankList, studentKey),
      bossTop5: bossRankList.slice(0, 10),
      myBossRank: findMyRank(bossRankList, studentKey),
      goldTop5: goldRankList.slice(0, 10),
      myGoldRank: findMyRank(goldRankList, studentKey)
    };
  } catch(e) {
    return { error: e.toString() };
  }
}

// 3. 교과 영단어 수집 처리 (시트가 비어있다면 자동 예외 보완)
function getWordsFromSheet(grade) {
  initDatabaseSheets(); // 구동 전 자동 그리드 점검
  
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Words");
    var data = sheet.getDataRange().getValues();
    var words = [];
    
    // 첫 행인 헤더를 제외한 모든 영단어 행 순회
    for (var i = 1; i < data.length; i++) {
      var rowGrade = String(data[i][0]).replace(/[^0-9]/g, '');
      if (rowGrade === String(grade)) {
        words.push({
          word: String(data[i][1]).trim(),
          meaning: String(data[i][2]).trim()
        });
      }
    }
    return words.length > 0 ? words : getMockWordsFallback(grade);
  } catch (err) {
    return getMockWordsFallback(grade);
  }
}

// 4-A. 계정 존재 여부 확인 + PIN 설정 여부 반환
function checkStudentExists(grade, classNum, studentNum, name) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Students");
    if (!sheet) return { exists: false };
    
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(grade) && 
          String(data[i][1]) === String(classNum) && 
          String(data[i][2]) === String(studentNum) && 
          String(data[i][3]) === String(name)) {
        // hasPassword: PIN이 이미 시트에 저장되어 있는지 여부 (18번째 열, 인덱스 17)
        var storedPw = (data[i][17] !== undefined && data[i][17] !== null) ? String(data[i][17]).trim() : "";
        return { exists: true, hasPassword: storedPw !== "" };
      }
    }
    return { exists: false };
  } catch(e) {
    return { exists: false };
  }
}

function loadOrCreateStudent(grade, classNum, studentNum, name, defaultAvatar, password) {
  initDatabaseSheets(); // 구동 전 자동 그리드 점검
  
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Students");
    var data = sheet.getDataRange().getValues();
    
    // 기존에 동일 학년-반-번호-이름으로 등록된 용사 데이터가 있는지 검색
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(grade) && 
          String(data[i][1]) === String(classNum) && 
          String(data[i][2]) === String(studentNum) && 
          String(data[i][3]) === String(name)) {
        
        var savedPassword = data[i][17] !== undefined && data[i][17] !== null ? String(data[i][17]).trim() : "";
        
        // PIN이 이미 저장된 계정: 반드시 일치해야 통과
        if (savedPassword !== "") {
          if (String(password).trim() !== savedPassword) {
            return { error: "password_mismatch" };
          }
        } else {
          // PIN이 비어있는 구계정: 최초 PIN 등록으로 처리 (저장)
          if (password && String(password).trim() !== "") {
            var range = sheet.getRange(i + 1, 18);
            range.setNumberFormat("@");
            range.setValue("'" + String(password).trim());
          }
        }

        // 직렬화되어 문자열 상태로 적재된 JSON 스킬 필드 안전 파싱
        // (신규 16번째 P열 / 구버전 17번째 Q열 모두 자동 호환 탐색)
        var parsedInventory = [];
        var parsedEquipped = [];
        
        try {
          var invRaw = data[i][15] || data[i][16] || "";
          if (typeof invRaw === 'string' && invRaw.startsWith('[')) {
             parsedInventory = JSON.parse(invRaw);
          } else if (Array.isArray(invRaw)) {
             parsedInventory = invRaw;
          }
        } catch(e) { parsedInventory = []; }

        try {
          var eqRaw = data[i][16] || data[i][17] || "";
          if (typeof eqRaw === 'string' && eqRaw.startsWith('[')) {
             parsedEquipped = JSON.parse(eqRaw);
          } else if (Array.isArray(eqRaw)) {
             parsedEquipped = eqRaw;
          }
        } catch(e) { parsedEquipped = []; }

        var loadedPetLevels = {};
        var petCol = String(data[i][11]).trim();
        if (petCol.startsWith('{')) {
           try { loadedPetLevels = JSON.parse(petCol); } catch(e) {}
        } else if (petCol && petCol !== "none" && petCol !== "") {
           loadedPetLevels[petCol] = Number(data[i][12]) || 0;
        }

        return {
          grade: Number(data[i][0]),
          classNum: Number(data[i][1]),
          studentNum: Number(data[i][2]),
          name: String(data[i][3]),
          gold: Number(data[i][4]) || 0,
          avatarType: String(data[i][5]) || "male",
          helmetLvl: Number(data[i][6]) || 1,
          armorLvl: Number(data[i][7]) || 1,
          weaponLvl: Number(data[i][8]) || 1,
          shieldLvl: Number(data[i][9]) || 1,
          shoesLvl: Number(data[i][10]) || 1,
          petLevels: loadedPetLevels,
          stage: Number(data[i][12]) || 1,
          progress: Number(data[i][13]) || 0,
          lastSaved: Number(data[i][14]) || Date.now(),
          skillsInventory: parsedInventory,
          equippedSkills: parsedEquipped,
          masteryPoints: Number(data[i][18]) || 0
        };
      }
    }
    
    // 만약 데이터베이스에 일치하는 기록이 없다면 새롭게 신규 용사 생성
    var defaultInvStr = "[]";
    var defaultEqStr = "[]";
    
    var newRow = [
      Number(grade), Number(classNum), Number(studentNum), String(name), 
      0, String(defaultAvatar), 1, 1, 1, 1, 1, "{}", 1, 0, Date.now(),
      defaultInvStr, defaultEqStr, "'" + String(password).trim(), 0
    ];
    
    sheet.appendRow(newRow);
    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow, 18).setNumberFormat("@");
    sheet.getRange(lastRow, 18).setValue(String(password).trim());
    
    return {
      grade: newRow[0], classNum: newRow[1], studentNum: newRow[2], name: newRow[3],
      gold: newRow[4], avatarType: newRow[5], helmetLvl: newRow[6], armorLvl: newRow[7],
      weaponLvl: newRow[8], shieldLvl: newRow[9], shoesLvl: newRow[10],
      petLevels: {}, stage: newRow[12], progress: newRow[13], 
      lastSaved: newRow[14], skillsInventory: [], equippedSkills: [], masteryPoints: 0
    };
  } catch(e) {
    return null;
  }
}

// 5. 플레이어 진행도 보존 실시간 업로드 동기화
function saveStudentProgress(grade, classNum, studentNum, name, gold, avatarType, helmetLvl, armorLvl, weaponLvl, shieldLvl, shoesLvl, petLevelsStr, stage, progress, skillsInventory, equippedSkills, masteryPoints) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Students");
    if (!sheet) return false;
    
    var data = sheet.getDataRange().getValues();
    
    // 학생 인덱스 탐색 진행
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(grade) && 
          String(data[i][1]) === String(classNum) && 
          String(data[i][2]) === String(studentNum) && 
          String(data[i][3]) === String(name)) {
        
        var targetRow = i + 1;
        
        // 획득한 영단어 등급별 스킬 인벤토리와 장착 슬롯을 문자열 형식으로 직렬화 변환
        var serializedInventory = JSON.stringify(skillsInventory || []);
        var serializedEquipped = JSON.stringify(equippedSkills || []);
        var existingPassword = data[i][17] !== undefined && data[i][17] !== null ? String(data[i][17]) : "";
        if (existingPassword !== "" && !existingPassword.startsWith("'")) {
          existingPassword = "'" + existingPassword;
        }

        // 5번째 열(E, Gold)부터 19번째 열(S, MasteryPoints)까지 15개 열 단일 배열 기록 (속도 최적화 & 열 어긋남 보장)
        var rowValues = [
          [
            gold, avatarType, helmetLvl, armorLvl, weaponLvl, shieldLvl, shoesLvl,
            petLevelsStr, stage, progress, Date.now(),
            serializedInventory, serializedEquipped, existingPassword, Number(masteryPoints) || 0
          ]
        ];

        sheet.getRange(targetRow, 18).setNumberFormat("@");
        sheet.getRange(targetRow, 5, 1, 15).setValues(rowValues);
        
        return true;
      }
    }
    return false;
  } catch(e) {
    return false;
  }
}

// 6. CSV 업로드를 통해 단어 일괄 추가 (교사용)
function uploadWordsBatch(wordsArray) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Words");
    if (!sheet) {
      initDatabaseSheets();
      sheet = ss.getSheetByName("Words");
    }
    
    for (var i = 0; i < wordsArray.length; i++) {
      var row = wordsArray[i];
      if (row && row.length >= 3) {
        sheet.appendRow([row[0], row[1], row[2]]);
      }
    }
    return { success: true, count: wordsArray.length };
  } catch(e) {
    return { error: e.toString() };
  }
}

// 7. 예외 보호용 복원 백업 단어 매핑 테이블
function getMockWordsFallback(grade) {
  var wordMap = {
    "3": [
      {word: "apple", meaning: "사과"}, {word: "banana", meaning: "바나나"}, {word: "pencil", meaning: "연필"},
      {word: "desk", meaning: "책상"}, {word: "cat", meaning: "고양이"}, {word: "dog", meaning: "개"},
      {word: "school", meaning: "학교"}, {word: "friend", meaning: "친구"}, {word: "mother", meaning: "어머니"},
      {word: "happy", meaning: "행복한"}
    ],
    "4": [
      {word: "doctor", meaning: "의사"}, {word: "english", meaning: "영어"}, {word: "orange", meaning: "오렌지"},
      {word: "window", meaning: "창문"}, {word: "family", meaning: "가족"}, {word: "summer", meaning: "여름"},
      {word: "winter", meaning: "겨울"}, {word: "teacher", meaning: "선생님"}, {word: "morning", meaning: "아침"},
      {word: "yellow", meaning: "노란색"}
    ],
    "5": [
      {word: "beautiful", meaning: "아름다운"}, {word: "different", meaning: "다른"}, {word: "important", meaning: "중요한"},
      {word: "remember", meaning: "기억하다"}, {word: "tomorrow", meaning: "내일"}, {word: "station", meaning: "역"},
      {word: "weather", meaning: "날씨"}, {word: "subject", meaning: "과목"}, {word: "country", meaning: "나라"},
      {word: "picture", meaning: "사진"}
    ],
    "6": [
      {word: "experience", meaning: "경험"}, {word: "challenge", meaning: "도전"}, {word: "environment", meaning: "환경"},
      {word: "volunteer", meaning: "자원봉사자"}, {word: "information", meaning: "정보"}, {word: "traditional", meaning: "전통적인"},
      {word: "international", meaning: "국제의"}, {word: "language", meaning: "언어"}, {word: "understand", meaning: "이해하다"},
      {word: "protect", meaning: "보호하다"}
    ]
  };
  return wordMap[String(grade)] || wordMap["3"];
}