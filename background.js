var LRU_TAB_LIST_PREFIX = "lruTabList-";
var ORIGIN_TAB_LIST_PREFIX = "originTabList-";
var CURRENT_HIGHLIGHTED_TAB_PREFIX = "currentHighlightedTab-";

//监听命令
chrome.commands.onCommand.addListener((command) => commandListener(command));
//监听tab删除事件
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => removedListener(tabId, removeInfo));
//监听tab高亮事件
chrome.tabs.onHighlighted.addListener((highlightInfo) => highlightedListener(highlightInfo));
//监听tab变化事件
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // console.log("tabId:%s, changeInfo:%o, tab:%o", tabId, changeInfo, tab);
    if (changeInfo.pinned == undefined || changeInfo.pinned == null) {
        return;
    }
    // console.log("after, tabId:%s, changeInfo:%o, tab:%o", tabId, changeInfo, tab);

    pinnedChangeEvent(tab.windowId, tabId, changeInfo.pinned);
});
//监听tab创建事件
chrome.tabs.onCreated.addListener((tab) => createdListener(tab));

function createdListener(tab) {
    let originTabListKey = ORIGIN_TAB_LIST_PREFIX + tab.windowId;
    chrome.storage.local.get([originTabListKey], (result) => {
        let originTabList = result[originTabListKey];
        originTabList.push(tab.id);
        chrome.storage.local.set(
            {
                [originTabListKey]: originTabList,
            },
            function () {
                console.log("%s is set to %s", originTabListKey, JSON.stringify(originTabList));
            }
        );
    });
}

function pinnedChangeEvent(windowId, tabId, pinned) {
    let lruTabListKey = LRU_TAB_LIST_PREFIX + windowId;
    let currentHighlightedTabKey = CURRENT_HIGHLIGHTED_TAB_PREFIX + windowId;
    let originTabListKey = ORIGIN_TAB_LIST_PREFIX + windowId;
    chrome.storage.local.get(
        [lruTabListKey, currentHighlightedTabKey, originTabListKey],
        (result) => {
            let lruTabList = result[lruTabListKey];
            let originTabList = result[originTabListKey];
            if (pinned) {
                lruTabList = lruTabList.filter((v) => tabId != v);
                originTabList = originTabList.filter((v) => tabId != v);
            } else {
                lruTabList.push(tabId);
                originTabList.push(tabId);
            }
            chrome.storage.local.set(
                {
                    [lruTabListKey]: lruTabList,
                    [originTabListKey]: originTabList,
                },
                function () {
                    console.log("%s is set to %s", lruTabListKey, JSON.stringify(lruTabList));
                }
            );
        }
    );
}

function commandListener(command) {
    console.log(command);
    chrome.windows.getCurrent({}, function (window) {
        // console.log("window result:%o", window);
        let lruTabListKey = LRU_TAB_LIST_PREFIX + window.id;
        let currentHighlightedTabKey = CURRENT_HIGHLIGHTED_TAB_PREFIX + window.id;
        let originTabListKey = ORIGIN_TAB_LIST_PREFIX + window.id;

        if (command === "data-init") {
            chrome.tabs.getAllInWindow(window.id, (tabsAllInWindow) =>
                init(lruTabListKey, currentHighlightedTabKey, originTabListKey, tabsAllInWindow)
            );
        } else if (command == "tab-recover") {
            chrome.storage.local.get([originTabListKey], (result) =>
                tabsRecover(result[originTabListKey], window.id)
            );
        } else if (command == "lru-tabs-delete") {
            chrome.storage.local.get([lruTabListKey, currentHighlightedTabKey], (result) =>
                executeDeleteCommand(lruTabListKey, currentHighlightedTabKey, result)
            );
        } else {
            chrome.storage.local.get([lruTabListKey, currentHighlightedTabKey], (result) =>
                executeSortCommand(
                    lruTabListKey,
                    currentHighlightedTabKey,
                    window.id,
                    command,
                    result
                )
            );
        }
    });
}

function tabsRecover(originTabList, windowId) {
    chrome.tabs.move(originTabList, {
        index: -1,
        windowId: windowId,
    });
}

function removedListener(tabId, removeInfo) {
    // console.log("tab removeed tabId:%s, removeInfo:%o", tabId, removeInfo);
    let lruTabListKey = LRU_TAB_LIST_PREFIX + removeInfo.windowId;
    let currentHighlightedTabKey = CURRENT_HIGHLIGHTED_TAB_PREFIX + removeInfo.windowId;
    let originTabListKey = ORIGIN_TAB_LIST_PREFIX + removeInfo.windowId;

    if (removeInfo.isWindowClosing) {
        chrome.storage.local.remove([lruTabListKey, originTabListKey, currentHighlightedTabKey]);
        return;
    }

    chrome.storage.local.get(
        [lruTabListKey, currentHighlightedTabKey, originTabListKey],
        function (result) {
            // console.log("tab remove storage get result : %s", JSON.stringify(result));
            if (
                result[currentHighlightedTabKey] != null &&
                result[currentHighlightedTabKey].tabId == tabId
            ) {
                chrome.storage.local.remove([currentHighlightedTabKey]);
            }

            if (result[lruTabListKey] != null && result[lruTabListKey] != undefined) {
                let afterRemoveLruTabList = result[lruTabListKey].filter((v) => tabId != v);
                // console.log("afterRemoveLruTabList:%o", afterRemoveLruTabList);
                chrome.storage.local.set(
                    {
                        [lruTabListKey]: afterRemoveLruTabList,
                    },
                    function () {
                        console.log(
                            "%s is set to %s",
                            lruTabListKey,
                            JSON.stringify(afterRemoveLruTabList)
                        );
                    }
                );
            }
            if (result[originTabListKey] != null && result[originTabListKey] != undefined) {
                let afterRemoveOriginTabList = result[originTabListKey].filter((v) => tabId != v);
                // console.log("afterRemoveOriginTabList:%o", afterRemoveOriginTabList);
                chrome.storage.local.set(
                    {
                        [originTabListKey]: afterRemoveOriginTabList,
                    },
                    function () {
                        console.log(
                            "%s is set to %s",
                            originTabListKey,
                            JSON.stringify(afterRemoveOriginTabList)
                        );
                    }
                );
            }
        }
    );
}

function highlightedListener(highlightInfo) {
    // console.log("\n tab highlighted info:%o", highlightInfo);

    let lruTabListKey = LRU_TAB_LIST_PREFIX + highlightInfo.windowId;
    let currentHighlightedTabKey = CURRENT_HIGHLIGHTED_TAB_PREFIX + highlightInfo.windowId;

    chrome.storage.local.get([currentHighlightedTabKey, lruTabListKey], function (result) {
        // console.log("storage get result : %s", JSON.stringify(result));
        updateCurrentHighlightedTab(currentHighlightedTabKey, highlightInfo);
        let lastHighlightedTab = result[currentHighlightedTabKey];
        if (lastHighlightedTab == undefined) {
            return;
        }

        let timeInterval = new Date().getTime() - lastHighlightedTab.activeTime;
        if (timeInterval < 2500) {
            return;
        }

        chrome.tabs.getAllInWindow(highlightInfo.windowId, function (allTabs) {
            // console.log("tabs get result allTabs : %o", allTabs);
            let allActiveTabIdList = [];
            for (let i = allTabs.length - 1; i >= 0; i--) {
                if (lastHighlightedTab.tabId == allTabs[i].id && allTabs[i].pinned) {
                    return;
                }
                if (allTabs[i].pinned) {
                    continue;
                }
                allActiveTabIdList.push(allTabs[i].id);
            }
            let lruTabList = result[lruTabListKey] == null ? [] : result[lruTabListKey];
            updateLruCache(lastHighlightedTab.tabId, lruTabList, lruTabListKey, allActiveTabIdList);
        });
    });
}

function updateLruCache(lastHighlightedTabId, lruTabList, lruTabListKey, allActiveTabIdList) {
    let newLruTabList = [lastHighlightedTabId];
    lruTabList.forEach((tabId) => {
        if (lastHighlightedTabId == tabId || allActiveTabIdList.indexOf(tabId) < 0) {
            return;
        }
        newLruTabList.push(tabId);
    });
    chrome.storage.local.set(
        {
            [lruTabListKey]: newLruTabList,
        },
        function () {
            console.log("%s is set to %s", lruTabListKey, JSON.stringify(newLruTabList));
        }
    );
}

function updateCurrentHighlightedTab(currentHighlightedTabKey, highlightInfo) {
    var currentHighlightedTab = {
        tabId: highlightInfo.tabIds[0],
        activeTime: new Date().getTime(),
    };
    chrome.storage.local.set({
        [currentHighlightedTabKey]: currentHighlightedTab,
    });
}

function init(lruTabListKey, currentHighlightedTabKey, originTabListKey, tabsAllInWindow) {
    let lruTabList = [];
    let originTabList = [];
    let highlightedTabId;
    tabsAllInWindow.forEach((tab) => {
        if (tab.pinned) {
            return;
        }
        if (tab.highlighted) {
            highlightedTabId = tab.id;
        }
        lruTabList.push(tab.id);
        originTabList.push(tab.id);
    });
    var currentHighlightedTab = {
        tabId: highlightedTabId,
        activeTime: new Date().getTime(),
    };

    chrome.storage.local.set(
        {
            [currentHighlightedTabKey]: currentHighlightedTab,
            [lruTabListKey]: lruTabList,
            [originTabListKey]: originTabList,
        },
        function () {
            console.log(
                "init success! lruTabList:%o, highlightedTabId:%s",
                lruTabList,
                highlightedTabId
            );
        }
    );
}

function executeSortCommand(lruTabListKey, currentHighlightedTabKey, windowId, command, result) {
    if (
        result[lruTabListKey] == null ||
        result[lruTabListKey] == undefined ||
        result[currentHighlightedTabKey] == null ||
        result[currentHighlightedTabKey] == undefined
    ) {
        return;
    }

    let currentTabId = result[currentHighlightedTabKey].tabId;

    let lruTabList = result[lruTabListKey];
    let tabIndex = [];
    for (let i = lruTabList.length - 1; i >= 0; i--) {
        if (currentTabId == lruTabList[i] || 15 == lruTabList[i]) {
            continue;
        }
        tabIndex.push(lruTabList[i]);
    }
    tabIndex.push(currentTabId);
    chrome.tabs.move(tabIndex, {
        index: -1,
        windowId: windowId,
    });
}

function executeDeleteCommand(lruTabListKey, currentHighlightedTabKey, result) {
    if (
        result[lruTabListKey] == null ||
        result[lruTabListKey] == undefined ||
        result[currentHighlightedTabKey] == null ||
        result[currentHighlightedTabKey] == undefined
    ) {
        return;
    }
    let currentTabId = result[currentHighlightedTabKey].tabId;
    let lruTabList = result[lruTabListKey];
    let end = Math.max(lruTabList.length - 4, 0);
    let tabIndexList = [];
    for (let i = lruTabList.length - 1; i >= end; i--) {
        if (currentTabId == lruTabList[i]) {
            continue;
        }
        tabIndexList.push(lruTabList[i]);
    }
    chrome.tabs.remove(tabIndexList);

    let afterDeleteLruTabList = lruTabList.filter((v) => tabIndexList.indexOf(v) < 0);
    chrome.storage.local.set({ [lruTabListKey]: afterDeleteLruTabList });
}
