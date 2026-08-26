import { test, expect } from '@playwright/test';

const appUrl = 'http://127.0.0.1:4173/';

async function showOnly(page, id) {
  await page.evaluate((targetId) => {
    document.querySelectorAll('body > [id$="Modal"], body > [id$="Overlay"]').forEach((node) => {
      if (node.id !== 'forgeResultOverlay') {
        node.classList.add('hidden');
        node.classList.remove('flex');
      }
    });
    const target = document.getElementById(targetId);
    if (!target) throw new Error(`Missing #${targetId}`);
    target.classList.remove('hidden');
    target.classList.add('flex');
    target.style.display = 'flex';
    target.scrollIntoView({ block: 'start' });
  }, id);
}

test('skill guide is consolidated and batch fusion reports its result', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.batchCombineSkills === 'function');
  await showOnly(page, 'skillTab');

  await expect(page.locator('#skillUnifiedGuide')).toHaveCount(1);
  await expect(page.getByText('스킬 수집 & 합성 가이드')).toHaveCount(0);
  await expect(page.locator('#skillDeckInfo')).toContainText('새 스킬 약 40회');

  await page.evaluate(() => {
    const grades = ['normal', 'rare'];
    gameState.skillsInventory = Array.from({ length: 18 }, (_, index) => ({
      id: `ui_batch_${index}`,
      word: `sample${index}`,
      meaning: `뜻 ${index}`,
      grade: grades[index < 12 ? 0 : 1],
      tier: 3,
      stars: 0,
      exp: 0,
      maxExp: index < 12 ? 1 : 3,
      cooldownRemaining: 0,
      maxCooldown: 30
    }));
    gameState.equippedSkills = [];
    gameState.skillLockedWords = [];
    gameState.skillDiscoveredWords = [];
    gameState.skillEssence = 0;
    gameState.skillSummonPity = { growthWithoutEquipped: 0 };
    gameState.skillFusionPity = { normal: 0, rare: 0, hero: 0, legendary: 0 };
    batchCombineSkills();
  });

  const confirmation = page.locator('#forgeResultDesc');
  await expect(page.locator('#forgeResultTitle')).toHaveText('마법 조합 연성 확인');
  await expect(confirmation).toContainText('6회 일괄 연성');
  await expect(confirmation).toContainText('재료 18장');
  expect((await confirmation.innerText()).split('\n').filter(Boolean).length).toBeLessThan(8);

  await page.locator('#proceedCombineBtn').click();
  await expect(page.locator('#forgeResultTitle')).toHaveText('일괄 연성 결과');
  await expect(confirmation).toContainText('승급');
  await expect(confirmation).toContainText('등급 유지');
  await expect(confirmation).toContainText('결과 카드 6장');
  await expect(confirmation.getByText('획득 카드 6장 모두 보기')).toBeVisible();
  await expect(confirmation.locator('.batch-fusion-result-card')).toHaveCount(6);
});

test('equipped relic emphasis preserves the card while lifting it in both themes', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    const layout = document.getElementById('gameMainLayout');
    layout.classList.remove('hidden');
    layout.style.setProperty('display', 'grid', 'important');
    const petTab = document.getElementById('petTab');
    petTab.classList.remove('hidden');
    petTab.style.setProperty('display', 'flex', 'important');
    const grid = document.getElementById('relicsInventoryGrid');
    grid.innerHTML = '<article class="relic-inventory-card" data-equipped="true" data-relic-grade="legendary" style="width:180px;height:180px;background:#991b1b"></article>';
  });
  await page.waitForTimeout(250);
  const card = page.locator('#relicsInventoryGrid .relic-inventory-card');
  for (const theme of ['dark', 'ivory']) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    const style = await card.evaluate((node) => {
      const computed = getComputedStyle(node);
      return { transform: computed.transform, background: computed.backgroundImage || computed.backgroundColor, shadow: computed.boxShadow };
    });
    expect(style.transform).not.toBe('none');
    expect(style.background).toBeTruthy();
    expect(style.shadow).toContain('rgb');
  }
});
