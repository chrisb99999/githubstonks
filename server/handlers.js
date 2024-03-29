const { MongoClient } = require("mongodb");
const ObjectID = require("mongodb").ObjectID;
require("dotenv").config();
const Axios = require("axios");
const crypto = require("crypto");
const { stonkData } = require("./utils");
const { v4: uuidv4 } = require("uuid");
// uuidv4()
const stonkDataArr = stonkData();
const { ObjectOfTokens } = require("./ObjectOfTokens");
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const { MONGO_URI } = process.env;
const DBNAME = "githubstonks";
const STOCKDATA_COLLECTION = "stock-data";
const USER_COLLECTION = "user-data";
const options = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
};

let client;
const connectDb = async (collection) => {
    if (!client) {
        client = MongoClient(MONGO_URI, options);
        await client.connect();
        console.log("client connected");
    }
    return client.db(DBNAME).collection(collection);
};

const disconnectDb = () => {
    if (client) {
        client.close();
        client = undefined;
        console.log("client disconnected");
    }
};

const insertStockData = async (stockDataArr) => {
    let collection = await connectDb(STOCKDATA_COLLECTION);
    stockDataArr.forEach(async (e) => {
        const query = { _id: e._id };
        const result = await collection.findOne(query);
        const initialPrice =
            e.stars * 0.0003 + e.forks * 0.0002 + e.commits * 0.0001;
        const marketPrice = e.totalBoughtShares * 0.1;
        const priceAfterMarket = initialPrice + marketPrice;
        const dollarIncrease = priceAfterMarket - initialPrice;
        e.price = priceAfterMarket;
        e.increasePrice = dollarIncrease;
        e.increasePercent = (100 * dollarIncrease) / initialPrice;
        e.initialPrice = initialPrice;
        if (!result) {
            await collection.insertOne(e);
            console.log("inserted data");
        }
        // updates stock if result exist but this breaks buy and sell so I leave it out temporarily
        // else {
        //     if (result.price != priceAfterMarket) {
        //         const stockQuery = { name: e.name };
        //         const update = {
        //             $set: {
        //                 price: priceAfterMarket,
        //                 increasePrice: dollarIncrease,
        //                 increasePercent: (100 * dollarIncrease) / initialPrice,
        //             },
        //             $push: { priceHistory: { "Price: $": priceAfterMarket } },
        //         };
        //         await collection.updateOne(stockQuery, update);
        //         console.log("updated");
        //     }
        // }
    });
};

const handleCards = async (req, res) => {
    await insertStockData(stonkDataArr).then(async () => {
        let collection = await connectDb(STOCKDATA_COLLECTION);
        let result = await collection.find().toArray();

        return res.status(200).json({ data: result });
    });
};

const handleSigninRedirect = (req, res) => {
    res.redirect(
        `https://github.com/login/oauth/authorize?client_id=${CLIENT_ID}`
    );
};

const handleOauthCallback = async (req, res) => {
    try {
        const code = req.query.code;
        const { data } = await Axios.post(
            `https://github.com/login/oauth/access_token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&code=${code}`
        );
        const accessTokenParams = new URLSearchParams(data);

        const accessToken = accessTokenParams.get("access_token");
        // const refreshToken = accessTokenParams.get("refresh_token");

        const { data: ghData } = await Axios.get(
            "https://api.github.com/user",
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            }
        );

        const cryptographicToken = crypto
            .randomBytes(32)
            .toString("base64")
            .replace(/\//g, "_")
            .replace(/\+/g, "-")
            .replace(/=/g, "");

        ObjectOfTokens[cryptographicToken] = ghData.id;
        // create user if it doesnt already exist
        let collection = await connectDb(USER_COLLECTION);
        const user = {
            id: ghData.id,
            username: ghData.login,
            startingBalance: 100000,
            buysAndSells: [],
            stocksOwned: {},
            newBalance: 100000,
        };
        const query = { id: ghData.id };
        const result = await collection.findOne(query);
        if (!result) {
            await collection.insertOne(user);
            console.log("inserted data");
        }
        res.redirect(`https://githubstonks.com/?id=${cryptographicToken}`);
    } catch (error) {
        console.log("error", error);
    }
};

const handleUserAuth = async (req, res) => {
    try {
        const token = req.body.id;
        const authenticated = ObjectOfTokens[token];

        if (authenticated === undefined) {
            return res.json({ message: "not authenticated" });
        }
        const id = authenticated[token];
        const query = { id: parseInt(id) };
        let collection = await connectDb(USER_COLLECTION);
        const result = await collection.findOne(query);
        if (!result) {
            return res.json({ auth: "false", message: "user not found" });
        }
        return res.json({ auth: "true", message: "user logged in" });
    } catch (error) {
        console.log("error", error);
    }
};

const handleUserBuy = async (req, res) => {
    const tokenid = req.params.id;
    const id = ObjectOfTokens[tokenid];
    let collection = await connectDb(USER_COLLECTION);
    let stockCollection = await connectDb(STOCKDATA_COLLECTION);
    const stockResult = await stockCollection.findOne({
        name: req.body.stockName,
    });
    const userResult = await collection.findOne({ id: id });
    const purchaseCost =
        parseInt(req.body.quantity) * parseFloat(stockResult.price) * 1.15;
    req.body.quantity.split("").forEach((e) => {
        if (isNaN(parseInt(e))) {
            return res.status(400).json({
                status: 400,
                message: "quantity must be number",
            });
        }
    });
    if (parseFloat(req.body.quantity) > 1000) {
        return res.status(400).json({
            status: 400,
            message: "quantity cannot be more than 1000",
        });
    }
    if (isNaN(parseFloat(req.body.quantity))) {
        return res.status(400).json({
            status: 400,
            message: "quantity must be number",
        });
    }
    if (!stockResult) {
        return res.status(400).json({
            status: 400,
            message: "stonk does not exist",
        });
    }
    if (req.body.quantity <= 0) {
        return res.status(400).json({
            status: 400,
            message: "cannot buy 0 or negative",
        });
    }
    if (purchaseCost > userResult.newBalance) {
        return res.status(400).json({
            status: 400,
            message: "not enough money to buy stonks",
        });
    }

    const bodyObj = {
        type: req.body.type,
        stockName: req.body.stockName,
        symbol: req.body.symbol,
        quantity: parseInt(req.body.quantity),
        purchaseCost: purchaseCost,
    };

    const query = { id: id };
    const push = { $push: { buysAndSells: bodyObj } };
    await collection.updateOne(query, push);

    const stockname = req.body.stockName;
    const updateStock = {
        $inc: {
            [`stocksOwned.${stockname}`]: +parseInt(req.body.quantity),
        },
    };
    await collection.updateOne(query, updateStock);

    const stockQuery = { name: stockname };
    const updateBoughtShares = {
        $inc: {
            totalBoughtShares: +parseInt(req.body.quantity),
        },
    };

    await stockCollection.updateOne(stockQuery, updateBoughtShares);
    let stockData = await stockCollection.find().toArray();
    stockData.forEach(async (e) => {
        if (e.name === stockname) {
            const initialPrice =
                e.stars * 0.0003 + e.forks * 0.0002 + e.commits * 0.0001;
            const marketPrice = e.totalBoughtShares * 0.00001;
            const priceAfterMarket = initialPrice + marketPrice;
            const dollarIncrease = priceAfterMarket - initialPrice;
            const updateValues = {
                $set: {
                    price: priceAfterMarket,
                    increasePrice: dollarIncrease,
                    increasePercent: (100 * dollarIncrease) / initialPrice,
                },
                $push: { priceHistory: { "Price: $": priceAfterMarket } },
            };
            await stockCollection.updateOne({ name: e.name }, updateValues);
        }
    });
    return res.status(200).json({
        confirmation: `Bought ${req.body.stockName} for ${purchaseCost}`,
        message: "success pushed buy to buyandsells in db",
    });
};

const handleUserSell = async (req, res) => {
    const tokenid = req.params.id;
    const id = ObjectOfTokens[tokenid];

    let collection = await connectDb(USER_COLLECTION);
    let stockCollection = await connectDb(STOCKDATA_COLLECTION);
    const stockResult = await stockCollection.findOne({
        name: req.body.stockName,
    });
    const userResult = await collection.findOne({ id: id });
    const purchaseCost =
        parseInt(req.body.quantity) * parseFloat(stockResult.price) * 1.15;
    req.body.quantity.split("").forEach((e) => {
        if (isNaN(parseInt(e))) {
            return res.status(400).json({
                status: 400,
                message: "quantity must be number",
            });
        }
    });
    if (parseFloat(req.body.quantity) > 1000) {
        return res.status(400).json({
            status: 400,
            message: "quantity cannot be more than 1000",
        });
    }
    if (isNaN(parseFloat(req.body.quantity))) {
        return res.status(400).json({
            status: 400,
            message: "quantity must be number",
        });
    }
    if (!stockResult) {
        return res.status(400).json({
            status: 400,
            message: "stonk does not exist",
        });
    }
    if (req.body.quantity <= 0) {
        return res.status(400).json({
            status: 400,
            message: "cannot sell 0 or negative",
        });
    }
    if (
        parseInt(req.body.quantity) > userResult.stocksOwned[req.body.stockName]
    ) {
        return res.status(400).json({
            status: 400,
            message: "you can't sell more stonks than you own",
        });
    }
    if (parseInt(req.body.quantity) <= 0) {
        return res.status(400).json({
            status: 400,
            message: "you can't sell zero or negative stonks",
        });
    }

    const bodyObj = {
        type: req.body.type,
        stockName: req.body.stockName,
        symbol: req.body.symbol,
        quantity: parseInt(req.body.quantity),
        purchaseCost: purchaseCost,
    };

    const query = { id: id };
    const push = { $push: { buysAndSells: bodyObj } };

    await collection.updateOne(query, push);
    const stockname = req.body.stockName;
    const updateStock = {
        $inc: {
            [`stocksOwned.${stockname}`]: -parseInt(req.body.quantity),
        },
    };
    await collection.updateOne(query, updateStock);

    const stockQuery = { name: stockname };
    const updateBoughtShares = {
        $inc: {
            totalBoughtShares: -parseInt(req.body.quantity),
        },
    };
    await stockCollection.updateOne(stockQuery, updateBoughtShares);
    let stockData = await stockCollection.find().toArray();
    stockData.forEach(async (e) => {
        if (e.name === stockname) {
            const initialPrice =
                e.stars * 0.0003 + e.forks * 0.0002 + e.commits * 0.0001;
            const marketPrice = e.totalBoughtShares * 0.00001;
            const priceAfterMarket = initialPrice + marketPrice;
            const dollarIncrease = priceAfterMarket - initialPrice;
            const updatePrices = {
                $set: {
                    price: priceAfterMarket,
                    increasePrice: dollarIncrease,
                    increasePercent: (100 * dollarIncrease) / initialPrice,
                },
            };
            const pushPriceHistory = {
                $push: { priceHistory: { "Price: $": priceAfterMarket } },
            };
            await stockCollection.updateOne(stockQuery, updatePrices);
            await stockCollection.updateOne(stockQuery, pushPriceHistory);
        }
    });
    return res.status(200).json({
        confirmation: `Sold ${req.body.stockName} for ${purchaseCost}`,
        message: "success pushed sell to buyandsells in db",
    });
};

const getBalance = async (id) => {
    const query = { id: parseInt(id) };
    let collection = await connectDb(USER_COLLECTION);
    let result = await collection.findOne(query);
    let total = 0;
    result.buysAndSells.forEach((elem) => {
        if (elem.type === "BUY") {
            total += parseFloat(elem.purchaseCost);
        } else {
            total -= parseFloat(elem.purchaseCost);
        }
    });
    await collection.updateOne(query, {
        $set: {
            newBalance: parseInt(result.startingBalance - total),
        },
    });
    return result.startingBalance - total;
};

const getPortfolioValue = async (id) => {
    const query = { id: parseInt(id) };
    let userCollection = await connectDb(USER_COLLECTION);
    let result = await userCollection.findOne(query);
    const stocksOwned = result.stocksOwned;
    let stockCollection = await connectDb(STOCKDATA_COLLECTION);
    let stockData = await stockCollection.find().toArray();
    let portfolioValue = 0;
    stockData.forEach((elem) => {
        if (stocksOwned[elem.name]) {
            portfolioValue += stocksOwned[elem.name] * elem.price;
        }
    });
    return portfolioValue;
};

const getProfitLoss = async (id) => {
    // get total purchase cost from user data
    const query = { id: parseInt(id) };
    let userCollection = await connectDb(USER_COLLECTION);
    let result = await userCollection.findOne(query);
    let totalCostAtPurchase = 0;
    result.buysAndSells.forEach((elem) => {
        if (elem.type === "BUY") {
            totalCostAtPurchase += parseFloat(elem.purchaseCost);
        } else {
            totalCostAtPurchase -= parseFloat(elem.purchaseCost);
        }
    });
    // get total value of shares owned from stockdata
    const stocksOwned = result.stocksOwned;
    let stockCollection = await connectDb(STOCKDATA_COLLECTION);
    let stockData = await stockCollection.find().toArray();
    let portfolioValue = 0;
    stockData.forEach((elem) => {
        if (stocksOwned[elem.name]) {
            portfolioValue += stocksOwned[elem.name] * elem.price;
        }
    });
    // return total value of shares - total cost at purchase
    return portfolioValue - totalCostAtPurchase;
};

const getTotalshares = async (id) => {
    const query = { id: parseInt(id) };
    let userCollection = await connectDb(USER_COLLECTION);
    let result = await userCollection.findOne(query);
    return result.stocksOwned;
};

const getAccountStats = async (id) => {
    const query = { id: parseInt(id) };
    let accountArr = [];
    let userCollection = await connectDb(USER_COLLECTION);
    let userResult = await userCollection.findOne(query);
    let stockCollection = await connectDb(STOCKDATA_COLLECTION);
    let stockData = await stockCollection.find().toArray();
    Object.keys(userResult.stocksOwned).forEach((stockname) => {
        let obj = {};
        obj.name = stockname;
        const foundData = stockData.find((e) => e.name === stockname);
        obj.symbol = foundData.symbol;
        obj.price = foundData.price;
        obj.quantity = userResult.stocksOwned[stockname];
        const foundStocksBought = userResult.buysAndSells.filter(
            (e) => e.stockName === stockname && e.type === "BUY"
        );
        let totalPurchaseCost = 0;
        foundStocksBought.forEach((elem) => {
            totalPurchaseCost += elem.purchaseCost;
        });
        obj.totalCostBasis = totalPurchaseCost;
        obj.totalGainLoss =
            foundData.price * userResult.stocksOwned[stockname] -
            totalPurchaseCost;
        obj.currentValue = foundData.price * userResult.stocksOwned[stockname];
        accountArr.push(obj);
    });
    return accountArr;
};

const handleUserInfo = async (req, res) => {
    const tokenid = req.params.id;
    const id = ObjectOfTokens[tokenid];
    if (id) {
        const balance = await getBalance(id);
        const portfolio = await getPortfolioValue(id);
        const netWorth = portfolio + balance;
        const profitLoss = await getProfitLoss(id);
        const totalShares = await getTotalshares(id);
        const accountStats = await getAccountStats(id);
        let collection = await connectDb(USER_COLLECTION);
        const query = { id: id };
        const setNetWorth = {
            $set: {
                networth: netWorth,
            },
        };
        await collection.updateOne(query, setNetWorth);
        return res.status(200).json({
            data: {
                balance,
                portfolio,
                netWorth,
                profitLoss,
                totalShares,
                accountStats,
            },
        });
    }
};

const handleDeleteSession = (req, res) => {
    const tokenid = req.params.id;
    delete ObjectOfTokens[tokenid];
    res.status(200).end();
};

const handleLeaderboard = async (req, res) => {
    let collection = await connectDb(USER_COLLECTION);
    let result = await collection.find().toArray();
    const usernameAndNetWorth = result.map((elem) => {
        const obj = {
            username: elem.username,
            networth: elem.networth,
        };
        return obj;
    });
    res.status(200).json({ leaderboard: usernameAndNetWorth });
};

module.exports = {
    handleCards,
    handleSigninRedirect,
    handleOauthCallback,
    handleUserAuth,
    handleUserBuy,
    handleUserSell,
    handleUserInfo,
    handleDeleteSession,
    handleLeaderboard,
};
