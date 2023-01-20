const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { format } = require("date-fns");
const app = express();
const dbFile = path.join(__dirname, "twitterClone.db");
app.use(express.json());
let db = null;
const initializeDBandServer = async () => {
  try {
    db = await open({
      filename: dbFile,
      driver: sqlite3.Database,
    });
  } catch (e) {
    console.log(e.message);
    process.exit(1);
  }
};

initializeDBandServer();

const authenticationMiddleware = (req, res, next) => {
  console.log("middleware is working");
  try {
    const authHeader = req.headers["authorization"];
    const jwtToken = authHeader.split(" ")[1];
    if (jwtToken === undefined) {
      res.status(401);
      res.send("Invalid JWT Token");
    } else {
      jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
        if (error) {
          res.status(401);
          res.send("Invalid JWT Token");
        } else {
          req.username = payload.username;
          next();
        }
      });
    }
  } catch (e) {
    console.log(e);
  }
};

app.get("/", (req, res) => {
  res.send("homepage");
});

app.post("/register", async (req, res) => {
  const { username, password, name, gender } = req.body;
  const getUserQuery = `select *
                        from User 
                        where username='${username}'`;

  const userResult = await db.get(getUserQuery);
  if (userResult !== undefined) {
    res.status(400);
    res.send("User already exists");
  }
  if (password.length < 6) {
    res.status(400);
    res.send("Password is too short");
  }
  const insertQuery = `insert into User(name,username,password,gender)
                                values('${name}','${username}','${password}','${gender}')`;
  await db.run(insertQuery);
  res.status(200);
  res.send("User created successfully");
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  console.log(`your username is ${username} and password is ${password}`);
  const userQuery = `select *
                        from User
                        where username = '${username}'`;
  try {
    const userResult = await db.get(userQuery);
    if (userResult === undefined) {
      res.status(400);
      res.send("Invalid user");
    }
    const compareResult = await bcrypt.compare(password, userResult.password);
    if (compareResult) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      res.send(jwtToken);
    } else {
      res.status(400);
      res.send("Invalid password");
    }
  } catch (e) {
    console.log(e);
  }
});

app.get("/user/following", authenticationMiddleware, async (req, res) => {
  const { username } = req;
  const userIdQuery = `select user_id from User where username = '${username}'`;
  const userIdResult = await db.get(userIdQuery);
  const { user_id } = userIdResult;
  const joinQuery = `select User.name from Follower left join User on
                    Follower.following_user_id = User.user_id
                    where Follower.follower_user_id =${user_id}`;
  const joinResult = await db.all(joinQuery);
  res.send(joinResult);
});

app.get("/user/followers", authenticationMiddleware, async (req, res) => {
  const { username } = req;
  const userIdQuery = `select user_id from User where username = '${username}'`;
  const userIdResult = await db.get(userIdQuery);
  const { user_id } = userIdResult;
  const joinQuery = `select User.name from Follower left join User on
                    Follower.follower_user_id = User.user_id
                    where Follower.following_user_id =${user_id}`;
  const joinResult = await db.all(joinQuery);
  res.send(joinResult);
});

app.get("/tweets/:tweetId", authenticationMiddleware, async (req, res) => {
  const { username } = req;
  const { tweetId } = req.params;
  const tweetUserQuery = `select user_id from Tweet where tweet_id=${tweetId}`;
  const tweetUserResult = await db.get(tweetUserQuery);
  console.log(`tweet user id is ${tweetUserResult.user_id}`);
  const getCurrentUserQuery = `select user_id from User
                                where username = '${username}'`;
  const currentUserResult = await db.get(getCurrentUserQuery);
  const { user_id } = currentUserResult;
  const listOfUsersFollowedByUserQuery = `select following_user_id from Follower
                                        where follower_user_id = ${user_id}`;
  const listOfUsersFollowedByUserResult = await db.all(
    listOfUsersFollowedByUserQuery
  );
  const mappedFollowedUsers = listOfUsersFollowedByUserResult.map(
    (x) => x.following_user_id
  );
  if (mappedFollowedUsers.indexOf(tweetUserResult.user_id) !== -1) {
    const tweets = `select * from Tweet where tweet_id=${tweetId}`;
    const tweetsResult = await db.get(tweets);
    const { tweet, date_time } = tweetsResult;

    const like = `select count(like_id) as likesCount
                 from Like where tweet_id=${tweetId}`;
    const likeResult = await db.get(like);
    const { likesCount } = likeResult;

    const reply = `select count(reply_id) as replyCount 
                  from Reply where tweet_id=${tweetId}`;
    const replyResult = await db.get(reply);
    const { replyCount } = replyResult;
    const ans = {
      tweet: tweet,
      likes: likesCount,
      replies: replyCount,
      dateTime: date_time,
    };
    res.send(ans);
  } else {
    res.status(401);
    res.send("Invalid Request");
  }
});

app.get(
  "/tweets/:tweetId/likes/",
  authenticationMiddleware,
  async (req, res) => {
    const { tweetId } = req.params;
    const likesQuery = `select *
                         from Like left join User
                         on Like.user_id = User.user_id
                         where Like.tweet_id = ${tweetId}`;
    const likesQueryResult = await db.all(likesQuery);
    const likesList = likesQueryResult.map((x) => x.username);
    res.send(likesList);
  }
);

app.get("/user/tweets", authenticationMiddleware, async (req, res) => {
  const { username } = req;
  const { tweet } = req.body;
  const getUserIdQuery = `select user_id from User where username='${username}'`;
  const userIdResult = await db.get(getUserIdQuery);
  const { user_id } = userIdResult;
  const dateTime = new Date();
  const formattedDate = format(dateTime, "yyyy-MM-dd HH-MM-ss");
  try {
    const insertQuery = `insert into Tweet
                            (user_id,tweet,date_time)
                            values
                            (${user_id},'${tweet}','${formattedDate}')`;
    await db.run(insertQuery);
    res.send("Created a Tweet");
  } catch (e) {
    console.log(e);
  }
});

app.delete("/tweets/:tweetId", authenticationMiddleware, async (req, res) => {
  const { username } = req;
  const { tweetId } = req.params;
  const tableUser = `select user_id from Tweet where tweet_id=${tweetId}`;
  const tableUserResult = await db.get(tableUser);
  const { user_id } = tableUserResult;
  const tweetUser = user_id;
  let currentUser;
  try {
    const getCurrentUserQuery = `select user_id from User
                                where username = '${username}'`;
    const currentUserResult = await db.get(getCurrentUserQuery);
    const { user_id } = currentUserResult;
    currentUser = user_id;
    console.log(`current user is ${user_id}`);
  } catch (e) {
    console.log(e);
  }
  if (tweetUser === currentUser) {
    const deleteQuery = `delete from Tweet where tweet_id=${tweetId}`;
    await db.run(deleteQuery);
    res.send("Tweet Removed");
  } else {
    res.status(401);
    res.send("Invalid Request");
  }
});

app.listen(3000, () => {
  console.log("server started successfully");
});

module.exports = app;
