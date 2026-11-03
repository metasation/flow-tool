document.getElementById('open').onclick = () => {
  chrome.tabs.create({ url: 'https://flow.google.com' });
};
document.getElementById('guide').onclick = () => {
  chrome.tabs.create({ url: 'https://github.com/metasation/flow-tool' });
};
