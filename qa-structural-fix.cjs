const { chromium } = require('playwright');
const sizes = [[375,812],[390,844],[768,900],[1024,800],[1280,850],[1440,900]];
(async()=>{
 const browser=await chromium.launch({headless:true});
 const results=[];
 for(const [width,height] of sizes){
  const page=await browser.newPage({viewport:{width,height}});
  await page.goto('http://127.0.0.1:3000/auth/google',{waitUntil:'networkidle'});
  await page.screenshot({path:`qa-shots/structural-fix-dashboard-${width}x${height}.png`, fullPage:false});
  results.push(await page.evaluate(()=>{
   const visible=el=>{if(!el)return false;const cs=getComputedStyle(el),r=el.getBoundingClientRect();return cs.display!=='none'&&cs.visibility!=='hidden'&&r.width>1&&r.height>1};
   const navs=Array.from(document.querySelectorAll('.customer-desktop-nav a')).filter(visible).map(a=>a.textContent.trim());
   const mobileDrawer=document.querySelector('.customer-mobile-drawer');
   const profilePanel=document.querySelector('.customer-profile-panel');
   return {
    width:innerWidth,
    bodyClass:document.body.className,
    hScroll:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,
    desktopNavVisible:visible(document.querySelector('.customer-desktop-nav')),
    desktopNavItems:navs,
    mobileMenuButton:visible(document.querySelector('.customer-menu-button')),
    mobileDrawerVisible:visible(mobileDrawer),
    mobileDrawerHidden:mobileDrawer?.hidden,
    profilePanelVisible:visible(profilePanel),
    profilePanelHidden:profilePanel?.hidden,
    oldShellPresent:!!document.querySelector('.bank-shell,.bank-side,.bank-main,.bank-top'),
    rawConcatVisible:document.body.innerText.includes('My ProfileSecurityPreferencesHelp & SupportSign Out') || document.body.innerText.includes('SearchNotificationsHelp'),
    aiBg:getComputedStyle(document.querySelector('.chat-fab')).backgroundColor
   };
  }));
  await page.close();
 }
 const mob=await browser.newPage({viewport:{width:390,height:844}});
 await mob.goto('http://127.0.0.1:3000/auth/google',{waitUntil:'networkidle'});
 await mob.click('.customer-menu-button'); await mob.waitForTimeout(200);
 await mob.screenshot({path:'qa-shots/structural-fix-dashboard-menu-open-390x844.png', fullPage:false});
 const mobileOpen=await mob.evaluate(()=>({open:document.body.classList.contains('open'),drawerHidden:document.querySelector('.customer-mobile-drawer')?.hidden,drawerVisible:getComputedStyle(document.querySelector('.customer-mobile-drawer')).display,drawerText:document.querySelector('.customer-mobile-drawer')?.innerText.replace(/\n/g,' | ')}));
 await mob.close();
 const prof=await browser.newPage({viewport:{width:1440,height:900}});
 await prof.goto('http://127.0.0.1:3000/auth/google',{waitUntil:'networkidle'});
 await prof.click('.customer-avatar'); await prof.waitForTimeout(200);
 await prof.screenshot({path:'qa-shots/structural-fix-profile-open-1440x900.png', fullPage:false});
 const profileOpen=await prof.evaluate(()=>({hidden:document.querySelector('.customer-profile-panel')?.hidden,display:getComputedStyle(document.querySelector('.customer-profile-panel')).display,text:document.querySelector('.customer-profile-panel')?.innerText.replace(/\n/g,' | ')}));
 await prof.close();
 const pub=await browser.newPage({viewport:{width:1440,height:900}});
 await pub.goto('http://127.0.0.1:3000/',{waitUntil:'networkidle'});
 await pub.screenshot({path:'qa-shots/structural-fix-homepage-recheck-1440x900.png', fullPage:false});
 const publicCheck=await pub.evaluate(()=>({bodyClass:document.body.className,hero:document.querySelector('.bank-hero h1')?.textContent.trim(),hScroll:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,visibleMega:Array.from(document.querySelectorAll('.mega-menu')).filter(el=>{const cs=getComputedStyle(el),r=el.getBoundingClientRect();return cs.display!=='none'&&cs.visibility!=='hidden'&&r.width>1&&r.height>1}).length}));
 await pub.close();
 await browser.close();
 console.log(JSON.stringify({results,mobileOpen,profileOpen,publicCheck},null,2));
})();
