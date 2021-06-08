const { MongoClient } = require("mongodb");
const ObjectID = require("mongodb").ObjectID;
require("dotenv").config();
const Axios = require("axios");
const { stonkData } = require("./utils");
const { v4: uuidv4 } = require("uuid");
// uuidv4()
const stonkDataArr = stonkData();
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

const handleTest = (req, res) => {
    try {
        return res.status(200).json({ status: 200, message: "this is a test" });
    } catch (error) {
        return res.status(404).json({
            status: 500,
            error: error.message,
        });
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
        if (!result) {
            await collection.insertOne(e);
            console.log("inserted data");
        }
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
    const code = req.query.code;
    const { data } = await Axios.post(
        `https://github.com/login/oauth/access_token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&code=${code}`
    );
    const accessTokenParams = new URLSearchParams(data);

    const accessToken = accessTokenParams.get("access_token");
    // const refreshToken = accessTokenParams.get("refresh_token");

    const { data: ghData } = await Axios.get("https://api.github.com/user", {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });
    let collection = await connectDb(USER_COLLECTION);
    const user = {
        id: ghData.id,
        username: ghData.login,
        startingBalance: 1000,
        buysAndSells: [],
        stocksOwned: {},
    };
    const query = { id: ghData.id };
    const result = await collection.findOne(query);
    if (!result) {
        await collection.insertOne(user);
        console.log("inserted data");
    }

    res.redirect(`http://localhost:3000?id=${ghData.id}`);
};

const handleUserAuth = async (req, res) => {
    const { id } = req.body;
    const query = { id: parseInt(id) };
    let collection = await connectDb(USER_COLLECTION);
    const result = await collection.findOne(query);
    if (!result) {
        return res.json({ message: "user not found" });
    }
    return res.json({ message: "user logged in" });
};

const handleUserBuy = async (req, res) => {
    const bodyObj = {
        type: req.body.type,
        stockName: req.body.stockName,
        symbol: req.body.symbol,
        quantity: parseInt(req.body.quantity),
        purchaseCost: parseFloat(req.body.purchaseCost),
    };
    const query = { id: parseInt(req.params.id) };
    const push = { $push: { buysAndSells: bodyObj } };
    let collection = await connectDb(USER_COLLECTION);
    await collection.updateOne(query, push);
    const stockname = req.body.stockName;
    const updateStock = {
        $inc: {
            [`stocksOwned.${stockname}`]: +parseInt(req.body.quantity),
        },
    };
    await collection.updateOne(query, updateStock);
    let stockCollection = await connectDb(STOCKDATA_COLLECTION);
    const stockQuery = { name: stockname };
    const updateBoughtShares = {
        $inc: {
            totalBoughtShares: +parseInt(req.body.quantity),
        },
    };

    await stockCollection.updateOne(stockQuery, updateBoughtShares);
    let stockData = await stockCollection.find().toArray();
    stockData.find(async (e) => {
        if (e.name === stockname) {
            const initialPrice =
                e.stars * 0.0003 + e.forks * 0.0002 + e.commits * 0.0001;
            const marketPrice = e.totalBoughtShares * 0.1;
            const priceAfterMarket = initialPrice + marketPrice;
            const dollarIncrease = priceAfterMarket - initialPrice;
            const updatePrices = {
                $set: {
                    price: priceAfterMarket,
                    increasePrice: dollarIncrease,
                    increasePercent: (100 * dollarIncrease) / initialPrice,
                },
            };
            await stockCollection.updateOne(stockQuery, updatePrices);
        }
    });
    return res
        .status(200)
        .json({ message: "success pushed buy to buyandsells in db" });
};

const handleUserSell = async (req, res) => {
    const bodyObj = {
        type: req.body.type,
        stockName: req.body.stockName,
        symbol: req.body.symbol,
        quantity: parseInt(req.body.quantity),
        purchaseCost: parseFloat(req.body.purchaseCost),
    };
    const query = { id: parseInt(req.params.id) };
    const push = { $push: { buysAndSells: bodyObj } };
    let collection = await connectDb(USER_COLLECTION);
    await collection.updateOne(query, push);
    const stockname = req.body.stockName;
    const updateStock = {
        $inc: {
            [`stocksOwned.${stockname}`]: -parseInt(req.body.quantity),
        },
    };
    await collection.updateOne(query, updateStock);
    let stockCollection = await connectDb(STOCKDATA_COLLECTION);
    const stockQuery = { name: stockname };
    const updateBoughtShares = {
        $inc: {
            totalBoughtShares: -parseInt(req.body.quantity),
        },
    };
    await stockCollection.updateOne(stockQuery, updateBoughtShares);
    let stockData = await stockCollection.find().toArray();
    stockData.find(async (e) => {
        if (e.name === stockname) {
            const initialPrice =
                e.stars * 0.0003 + e.forks * 0.0002 + e.commits * 0.0001;
            const marketPrice = e.totalBoughtShares * 0.1;
            const priceAfterMarket = initialPrice + marketPrice;
            const dollarIncrease = priceAfterMarket - initialPrice;
            const updatePrices = {
                $set: {
                    price: priceAfterMarket,
                    increasePrice: dollarIncrease,
                    increasePercent: (100 * dollarIncrease) / initialPrice,
                },
            };
            await stockCollection.updateOne(stockQuery, updatePrices);
        }
    });
    return res
        .status(200)
        .json({ message: "success pushed sell to buyandsells in db" });
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
    const id = parseInt(req.params.id);
    console.log("id", id);
    if (id) {
        const balance = await getBalance(id);
        const portfolio = await getPortfolioValue(id);
        const netWorth = portfolio + balance;
        const profitLoss = await getProfitLoss(id);
        const totalShares = await getTotalshares(id);
        const accountStats = await getAccountStats(id);
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

module.exports = {
    handleTest,
    handleCards,
    handleSigninRedirect,
    handleOauthCallback,
    handleUserAuth,
    handleUserBuy,
    handleUserSell,
    handleUserInfo,
};
