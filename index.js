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

var twitter = new Twitter(twitterConfig);

/**
 * Entry point for each cycle
 */
function start() {
    twitter.getSearch({
        q: SEARCH_WORDS.join(" "),
        lang: "en",
        count: "15"
    }, (err, response, body) => {
        console.error("SEARCH ERROR:", err, response);
    }, (data) => {
        var response = JSON.parse(data);
        processTweets(response.statuses);
    });
    
    // Do the next one in half an hour
    setTimeout(start, 30 * 60 * 1000);
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

function logCorrection(tweet, correction) {
    console.log(tweet.user.screen_name, "-\n");
    console.log(tweet.text, "\n\n");
    console.log("*" + correction);
    console.log("\n\n\n\n");
}

start();