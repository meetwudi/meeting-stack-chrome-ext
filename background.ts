export {};

chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.create({
    url: chrome.runtime.getURL("tabs/index.html"),
    active: true,
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "openStackRank") {
    chrome.tabs.create({
      url: "tabs/index.html"  
    })
    sendResponse({ status: "success" })
  }
  return true
}) 