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
    // 필요한 모든 백엔드 필드 정의 (인벤토리 스킬 및 장착 슬롯 저장 공간 포함)
    var studentHeaders = [
      "Grade", "Class", "Number", "Name", "Gold", 
      "AvatarType", "HelmetLvl", "ArmorLvl", "WeaponLvl", "ShieldLvl", "ShoesLvl", 
      "PetType", "PetLvl", "Stage", "Progress", "LastSaved", 
      "SkillsInventory", "EquippedSkills", "Password"
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
        // hasPassword: PIN이 이미 시트에 저장되어 있는지 여부
        var storedPw = data[i][18] ? String(data[i][18]).trim() : "";
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
        
        var savedPassword = data[i][18] ? String(data[i][18]).trim() : "";
        
        // PIN이 이미 저장된 계정: 반드시 일치해야 통과
        if (savedPassword !== "") {
          if (String(password).trim() !== savedPassword) {
            return { error: "password_mismatch" };
          }
        } else {
          // PIN이 비어있는 구계정: 최초 PIN 등록으로 처리 (저장)
          if (password && String(password).trim() !== "") {
            sheet.getRange(i + 1, 19).setValue(String(password).trim());
          }
        }

        // 직렬화되어 문자열 상태로 적재된 JSON 스킬 필드 안전 파싱
        var parsedInventory = [];
        var parsedEquipped = [];
        try {
          if (data[i][16]) parsedInventory = JSON.parse(data[i][16]);
          if (data[i][17]) parsedEquipped = JSON.parse(data[i][17]);
        } catch(e) {
          // 파싱 실패 시 초기 세션 구조 할당
          parsedInventory = [];
          parsedEquipped = [];
        }

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
          stage: Number(data[i][13]) || 1,
          progress: Number(data[i][14]) || 0,
          lastSaved: Number(data[i][15]) || Date.now(),
          skillsInventory: parsedInventory,
          equippedSkills: parsedEquipped
        };
      }
    }
    
    // 만약 데이터베이스에 일치하는 기록이 없다면 새롭게 신규 용사 생성
    var defaultInvStr = "[]";
    var defaultEqStr = "[]";
    
    var newRow = [
      Number(grade), Number(classNum), Number(studentNum), String(name), 
      0, String(defaultAvatar), 1, 1, 1, 1, 1, "{}", "", 1, 0, Date.now(),
      defaultInvStr, defaultEqStr, String(password)
    ];
    
    sheet.appendRow(newRow);
    
    return {
      grade: newRow[0], classNum: newRow[1], studentNum: newRow[2], name: newRow[3],
      gold: newRow[4], avatarType: newRow[5], helmetLvl: newRow[6], armorLvl: newRow[7],
      weaponLvl: newRow[8], shieldLvl: newRow[9], shoesLvl: newRow[10],
      petLevels: {}, stage: newRow[13], progress: newRow[14], 
      lastSaved: newRow[15], skillsInventory: [], equippedSkills: []
    };
  } catch(e) {
    return null;
  }
}

// 5. 플레이어 진행도 보존 실시간 업로드 동기화
function saveStudentProgress(grade, classNum, studentNum, name, gold, avatarType, helmetLvl, armorLvl, weaponLvl, shieldLvl, shoesLvl, petLevelsStr, stage, progress, skillsInventory, equippedSkills) {
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

        sheet.getRange(targetRow, 5).setValue(gold);
        sheet.getRange(targetRow, 6).setValue(avatarType);
        sheet.getRange(targetRow, 7).setValue(helmetLvl);
        sheet.getRange(targetRow, 8).setValue(armorLvl);
        sheet.getRange(targetRow, 9).setValue(weaponLvl);
        sheet.getRange(targetRow, 10).setValue(shieldLvl);
        sheet.getRange(targetRow, 11).setValue(shoesLvl);
        sheet.getRange(targetRow, 12).setValue(petLevelsStr);
        sheet.getRange(targetRow, 13).setValue("");
        sheet.getRange(targetRow, 14).setValue(stage);
        sheet.getRange(targetRow, 15).setValue(progress);
        sheet.getRange(targetRow, 16).setValue(Date.now());
        sheet.getRange(targetRow, 17).setValue(serializedInventory);
        sheet.getRange(targetRow, 18).setValue(serializedEquipped);
        
        return true;
      }
    }
    return false;
  } catch(e) {
    return false;
  }
}

// 6. 예외 보호용 복원 백업 단어 매핑 테이블
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