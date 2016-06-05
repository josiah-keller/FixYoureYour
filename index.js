const fs = require("fs");
const Twitter = require("twitter-node-client").Twitter;
const twitterConfig = require("./twitter-config");

const SEARCH_WORDS = ["your", "youre", "you're"];
const CORRECTIONS = {
    "your": 99,
    "you're": 198,
    "yore": 199,
    "yer": 200
};
const CORRECTION_PROBABILITY_SPACE = 201;

var interactionsHistory = {}, lastMentionId;

var twitter = new Twitter(twitterConfig);

/**
 * Restores state from data.json, then starts the cycle
 */
function initialize() {
    fs.readFile("data.json", (err, data) => {
        if (err) {
            return console.error("FATAL: couldn't restore app state from data.json");
        }
        var state = JSON.parse(data);
        interactionsHistory = data.interactionsHistory || {};
        lastMentionId = data.lastMentionId || 1;
        
        start();
    });
}

/**
 * Saves state in data.json so that if app gets restarted we remember what the last mention we saw was and who we've talked to
 */
function saveState() {
    var state = JSON.stringify({
        interactionsHistory: interactionsHistory,
        lastMentionId: lastMentionId
    });
    fs.writeFile("data.json", state, (err) => {
        if (err) {
            return console.error("ERROR: couldn't persist app state in data.json");
        }
        console.log("Successfully persisted to data.json");
    });
}

/**
 * Entry point for each cycle
 */
function start() {
    doSearch();
    
    processMentions();
    
    // Do the next one in half an hour
    setTimeout(start, 30 * 60 * 1000);
}

/**
 * Handles mentions
 */
function processMentions() {
    twitter.getMentionsTimeline({
        count: 10,
        since_id: lastMentionId
    }, (err, response, body) => {
        console.error("MENTIONS ERROR:", err, response);
    }, (data) => {
        var response = JSON.parse(data), mentionsToReplyTo = [];
        response.forEach((tweet) => {
            lastMentionId = tweet.id;
            if (interactionsHistory[tweet.user.screen_name] >= 1) {
                // Don't keep harassing someone
                return;
            }
            if (! interactionsHistory.hasOwnProperty(tweet.user.screen_name)) {
                interactionsHistory[tweet.user.screen_name] = 0;
            }
            interactionsHistory[tweet.user.screen_name]++;
            mentionsToReplyTo.push(tweet);
        });
        processTweets(mentionsToReplyTo);
        saveState();
    });
}

/**
 * Does the main searching to find tweets to correct
 */
function doSearch() {
    twitter.getSearch({
        q: SEARCH_WORDS.join(" "),
        lang: "en",
        count: 5
    }, (err, response, body) => {
        console.error("SEARCH ERROR:", err, response);
    }, (data) => {
        var response = JSON.parse(data);
        processTweets(response.statuses);
    });
}

/**
 * Takes search results and goes through the process of responding to them
 */
function processTweets(tweets) {
    tweets.forEach((tweet, index) => {
        var word = pickWord(tweet.text),
            wordIndex, correctWord, correction;
        if (word === null){ 
            // Skip this tweet
            return;
        }
        wordIndex = tweet.text.indexOf(word);
        correctWord = getCorrectWord(word, wordIndex, tweet.text);
        
        correction = pickCorrection(correctWord);
      
        logCorrection(tweet, correction);
        tweetCorrection(tweet, correction);
    });
}

/**
 * Picks which one of the SEARCH_WORDS out of the tweet we're going to try and correct.  If none of them are there for some reason, returns null
 */
function pickWord(text) {
    return SEARCH_WORDS.reduce((prev, word) => {
        if (text.indexOf(word) > -1) {
            return word;
        }
        return prev;
    }, null);
}

/**
 * Tries to figure out the correct word that should be used in this case.  If it doesn't know, returns null
 */
function getCorrectWord(word, wordIndex, text) {
    if (word === "your") {
        if (text.substring(wordIndex, wordIndex + word.length + 2) === "your a ") {
            // Assume they're trying to say "you're a ___"
            return "you're";
        }
        if (text.substring(wordIndex, wordIndex + word.length + 3) === "your an ") {
            // Assume they're trying to say "you're an ___"
            return "you're";
        }
        if (text.substring(wordIndex, wordIndex + word.length + 3) === "your my ") {
            // Assume they're trying to say "you're my ___"
            return "you're";
        }
        if (text.substring(wordIndex, wordIndex + word.length + 4) === "your the ") {
            // Assume they're trying to say "you're the ___"
            return "you're";
        }
    }
    if (word === "youre") {
        // This is just a misspelling
        return "you're";
    }
    return null;
}

/**
 * Picks a correction
 */
function pickCorrection(correctWord) {
    if (correctWord && CORRECTIONS.hasOwnProperty(correctWord)) {
        // If there's a known correction, most likely offer it
        if (Math.random() <= 0.8) {
            return correctWord;
        }
    }
    // If there's not, or if we just feel like it, troll
    var random = Math.floor(Math.random() * CORRECTION_PROBABILITY_SPACE), correction, prevFloor = -1;
    Object.keys(CORRECTIONS).forEach((word) => {
        if (random > prevFloor && random <= CORRECTIONS[word]) {
            correction = word;
        }
        prevFloor = CORRECTIONS[word];
    });
    return correction;
}

/**
 * Logs a correction in the console before it gets sent
 */
function logCorrection(tweet, correction) {
    console.log(tweet.user.screen_name, "-\n");
    console.log(tweet.text, "\n\n");
    console.log("*" + correction);
    console.log("\n\n\n\n");
}

/**
 * Tweets the correction reply
 */
function tweetCorrection(tweet, correction) {
    twitter.postTweet({
        status: "@" + tweet.user.screen_name + " *" + correction,
        in_reply_to_status_id: tweet.id
    }, (err, response, body) => {
        console.error("TWEET ERROR:", err, response);
    }, (data) => {
        var reply = JSON.parse(data);
        console.log("Tweeted correction to @" + tweet.user.screen_name, reply.id);
    });
}

initialize();