export {};

chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.create({
    url: chrome.runtime.getURL("tabs/index.html"),
    active: true,
  });
});
