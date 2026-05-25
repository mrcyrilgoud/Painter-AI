import puppeteer from "puppeteer";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log("Starting Painter AI Demo Automation Script...");
  
  // Launch Chrome headfully and bind it to the local user's Chrome binary for native behavior
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1280, height: 800 },
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    args: ["--start-maximized"]
  });

  const page = await browser.newPage();
  
  try {
    console.log("Navigating to http://localhost:5173...");
    await page.goto("http://localhost:5173", { waitUntil: "networkidle2" });
    await sleep(3000); // Let UI settle

    // --- STEP 1: INITIAL GENERATION ---
    console.log("1. Opening Command Bar with Ctrl+K...");
    await page.keyboard.down("Control");
    await page.keyboard.press("k");
    await page.keyboard.up("Control");
    await sleep(1500);

    console.log("Waiting for Command Bar input...");
    await page.waitForSelector('textarea[placeholder="What should I do?"]');
    
    console.log("Typing 'sailing on a sunny day'...");
    await page.type('textarea[placeholder="What should I do?"]', "sailing on a sunny day");
    await sleep(1000);
    
    console.log("Pressing Enter to generate...");
    await page.keyboard.press("Enter");
    
    // Wait for the variations grid to appear and finish loading
    console.log("Waiting for AI generation variations to be ready...");
    await page.waitForSelector('button[title="Click to commit · hover to preview"]', { timeout: 60000 });
    await sleep(2000); // Visual pause

    console.log("Hovering over first variation tile...");
    const tiles = await page.$$('button[title="Click to commit · hover to preview"]');
    await tiles[0].hover();
    await sleep(1500);

    console.log("Clicking the first variation tile to commit it...");
    await tiles[0].click();
    await sleep(3000); // Let layer commit and render

    // --- STEP 2: INPAINT ---
    console.log("2. Selecting the 'Select' tool...");
    await page.click('button[aria-label="Select"]');
    await sleep(1000);

    console.log("Dragging on the sky region to make a selection...");
    const wrap = await page.$('div[class*="canvasWrap"]');
    const box = await wrap.boundingBox();
    
    // Select the top-middle sky region
    const startX = box.x + box.width * 0.15;
    const startY = box.y + box.height * 0.1;
    const endX = box.x + box.width * 0.85;
    const endY = box.y + box.height * 0.35;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 15 });
    await page.mouse.up();
    await sleep(2000); // Visual pause

    console.log("Opening Command Bar again for inpainting...");
    await page.keyboard.down("Control");
    await page.keyboard.press("k");
    await page.keyboard.up("Control");
    await sleep(1500);

    console.log("Typing 'a flock of birds' in selected region...");
    await page.type('textarea[placeholder="What should I do?"]', "a flock of birds");
    await sleep(1000);
    await page.keyboard.press("Enter");

    console.log("Waiting for inpaint variations to be ready...");
    await page.waitForSelector('button[title="Click to commit · hover to preview"]', { timeout: 60000 });
    await sleep(2000);

    console.log("Hovering and clicking first inpaint variation...");
    const inpaintTiles = await page.$$('button[title="Click to commit · hover to preview"]');
    await inpaintTiles[0].hover();
    await sleep(1500);
    await inpaintTiles[0].click();
    await sleep(3000);

    // --- STEP 3: PAINT BUCKET ---
    console.log("3. Selecting red color #c1352b...");
    await page.click('button[aria-label="Color #c1352b"]');
    await sleep(1000);

    console.log("Selecting the 'Fill' tool...");
    await page.click('button[aria-label="Fill"]');
    await sleep(1000);

    console.log("Clicking in the center (where the sailboat flag is likely located)...");
    // Click at canvas coordinate (512, 450)
    const fillX = box.x + box.width * 0.5;
    const fillY = box.y + box.height * 0.44;
    await page.mouse.click(fillX, fillY);
    await sleep(2500); // Visual pause

    // --- STEP 4: MANUAL PAINTING TOOLS ---
    console.log("4. Selecting white color #ffffff...");
    await page.click('button[aria-label="Color #ffffff"]');
    await sleep(1000);

    console.log("Selecting the 'Brush' tool...");
    await page.click('button[aria-label="Brush"]');
    await sleep(1000);

    console.log("Selecting brush size 4...");
    await page.click('button[aria-label="Size 4"]');
    await sleep(1000);

    console.log("Drawing a small horizontal white stripe on the sail/flag...");
    const drawStartX = box.x + box.width * 0.45;
    const drawStartY = box.y + box.height * 0.42;
    const drawEndX = box.x + box.width * 0.55;
    const drawEndY = box.y + box.height * 0.42;

    await page.mouse.move(drawStartX, drawStartY);
    await page.mouse.down();
    await page.mouse.move(drawEndX, drawEndY, { steps: 10 });
    await page.mouse.up();
    await sleep(2000); // Visual pause

    // --- STEP 5: OTHER FEATURES & UNDO/REDO ---
    console.log("5. Testing Undo/Redo...");
    console.log("Pressing Ctrl+Z to undo drawing stripe...");
    await page.keyboard.down("Control");
    await page.keyboard.press("z");
    await page.keyboard.up("Control");
    await sleep(2000);

    console.log("Pressing Ctrl+Shift+Z to redo drawing stripe...");
    await page.keyboard.down("Control");
    await page.keyboard.down("Shift");
    await page.keyboard.press("z");
    await page.keyboard.up("Shift");
    await page.keyboard.up("Control");
    await sleep(2000);

    console.log("Selecting the 'Eraser' tool...");
    await page.click('button[aria-label="Eraser"]');
    await sleep(1000);

    console.log("Erasing a small portion on the canvas...");
    const eraseX = box.x + box.width * 0.4;
    const eraseY = box.y + box.height * 0.42;
    await page.mouse.click(eraseX, eraseY);
    await sleep(1500);

    console.log("Undoing the erasure...");
    await page.keyboard.down("Control");
    await page.keyboard.press("z");
    await page.keyboard.up("Control");
    await sleep(2000);

    console.log("Toggling layer visibility...");
    // Let's click the eye icon
    await page.click('button[aria-label="Hide layer"], button[aria-label="Show layer"]');
    await sleep(2000);
    // Toggle it back on
    await page.click('button[aria-label="Hide layer"], button[aria-label="Show layer"]');
    await sleep(2000);

    // --- STEP 6: SMART SELECT ---
    console.log("6. Selecting the 'Smart Select' tool...");
    await page.click('button[aria-label="Smart Select"]');
    await sleep(1000);

    console.log("Clicking near the center of the sailboat to segment it...");
    const segmentX = box.x + box.width * 0.5;
    const segmentY = box.y + box.height * 0.55;
    await page.mouse.click(segmentX, segmentY);
    
    console.log("Waiting for Smart Select to finish...");
    await sleep(4000); // Visual pause for the marching ants selection bounds
    
    console.log("Demo Automation Completed successfully!");
    await sleep(3000); // Leave browser visible at the end of recording

  } catch (err) {
    console.error("Automation error:", err);
  } finally {
    console.log("Closing browser...");
    await browser.close();
  }
}

main().catch(console.error);
