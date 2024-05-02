import _http from "http";
import _url from "url";
import _fs from "fs";
import _express from "express";
import _dotenv from "dotenv";
import _cors from "cors";
import _nodemailer from "nodemailer";
import _bcryptjs from "bcryptjs";
import _jwt from "jsonwebtoken";
import _cloudinary, { UploadApiResponse } from "cloudinary";

_dotenv.config({"path":".env"});


_cloudinary.v2.config({
    cloud_name: process.env.cloud_name,
    api_key: process.env.api_key,
    api_secret: process.env.api_secret
});


import {MongoClient, ObjectId} from "mongodb";

const DBNAME = process.env.DBNAME;
const app = _express();
const connectionString= process.env.connectionStringAtlas;

const HTTP_PORT:number = parseInt(process.env.PORT);
let paginaErrore;

const ENCRYPTION_KEY = _fs.readFileSync('./keys/encryptionKey.txt', 'utf8')

const http_server = _http.createServer(app);

http_server.listen(HTTP_PORT, () => {
    init();
    console.log(`Il Server HTTP è in ascolto sulla porta ${HTTP_PORT}`);
});

function init(){
    _fs.readFile("./static/error.html",function(err,data){
        if(err){
            paginaErrore = "<h1>Risorsa non trovata</h1>";
        }
        else{
            paginaErrore=data.toString();
        }
    });
}

app.use("/", (req:any, res:any, next:any) => {
    console.log("-----> "+req.method +": "+ req.originalUrl);
    next();
});

app.use("/", _express.static("./static"));

app.use("/",_express.json({"limit":"50mb"})); 
app.use("/",_express.urlencoded({"limit":"50mb","extended":true})); 

app.use("/", (req:any, res:any, next:any) => {
    if(Object.keys(req["query"]).length>0)
        console.log("      "+JSON.stringify(req["query"]));
    if(Object.keys(req["body"]).length > 0)
        console.log("      "+JSON.stringify(req["body"]));
    next();
});

const corsOptions = {
    origin: function(origin, callback) {
        return callback(null, true);
    },
    credentials: true
};
app.use("/", _cors(corsOptions));


const transporter = _nodemailer.createTransport({
    "service": "gmail",
    "auth": {
        "user": process.env.gMailUser,
        "pass": process.env.gMailPassword
    },
    "tls": {
        "rejectUnauthorized": false
    }
});
let message = _fs.readFileSync("./message.html","utf8");


app.post("/api/login", async (req:any, res:any) => {
    let username = req.body.username;
    let password = req.body.password;
    let admin = req.body.admin;
    const client = new MongoClient(connectionString);   
    await client.connect();
    const collection = client.db(DBNAME).collection("utenti");
    let regex = new RegExp("^"+username+"$", "i");
    let rq = collection.findOne({"username":regex, "admin" : admin}, {"projection" : {"username":1, "password":1}});
    rq.then((dbUser:any)=>{
        
        if(!dbUser){
            res.status(401).send("Credenziali non valide");
        }
        else{
            _bcryptjs.compare(password, dbUser.password, (err:any, success:any)=>{
                if(err)
                    res.status(500).send("Bcrypt error "+ err.message);
                else{
                    if(!success){
                        res.status(401).send("Password non valida");
                    }
                    else{
                        let token = creaToken(dbUser);
                        res.setHeader("authorization",token)
                        //Fa si che venga restituita al client
                        res.setHeader("access-control-expose-headers","authorization")
                        res.send({"ris": "ok"})
                    }
                }
            })
        }
    })
    rq.catch((err:any)=>{
        res.status(500).send("errore esecuzione query "+ err.message)
    })
    rq.finally(()=>{
        client.close();
    })
})

function creaToken(data){
    let currentDate = Math.floor(new Date().getTime() / 1000); 
    let payload ={
        "_id" : data["_id"],
        "username" : data["username"],
        "iat" : data.iat || currentDate,
        "exp" : currentDate + parseInt(process.env.durataToken)
    }
    let token = _jwt.sign(payload, ENCRYPTION_KEY)
    
    return(token);


}

app.use("/api/",(req:any, res:any, next:any)=>{
    if(!req["body"]["skipCheckToken"]){
        if(!req.headers["authorization"]){
            res.status(403).send("Token mancante");
        }
        else{
            let token = req.headers["authorization"];
           _jwt.verify(token, ENCRYPTION_KEY, (err,payload)=>{
                console.log(err + "err\n" + payload + "payload");
                if(err){
                    res.status(403).send("Token corrotto "+ err);
                }
                else{
                    let newToken = creaToken(payload);
                    res.setHeader("authorization",newToken)
                    res.setHeader("access-control-expose-headers","authorization")
                    req["payload"] = payload;
                    next();
                }
            }) 
        }
    }
    else{
        next();
    }
    
})

app.patch("/api/changePwd", async(req:any, res:any) => {
    let username = req["payload"]["username"];
    let newPwd = req.body.newPassword;
    let oldPwd = req.body.oldPassword;
    let client = new MongoClient(connectionString);
    await client.connect();
    const collection = client.db(DBNAME).collection("utenti");
    let regex = new RegExp("^"+username+"$", "i");
    let rq = collection.findOne({"username":regex}, {"projection": {"password":1}});
    rq.then((data)=>{
        let pwd = data.password;
        if(!_bcryptjs.compareSync(oldPwd, pwd)){
            res.status(500).send("Password non corretta");
        }
        else{
            let newPassword = _bcryptjs.hashSync(newPwd, 10);
            let rq = collection.updateOne({"username":regex}, {"$set": {"password": newPassword, "firstAccess": false}});
            rq.then((data)=>{
                console.log("Password aggiornata correttamente");
                res.send("ok");
            })
            rq.catch((err)=>{
                console.log("Errore aggiornamento password "+ err.message);
                client.close();
            })
            rq.finally(()=>{
                client.close();
            })
        }
    })
    rq.catch((err)=>{
        res.status(500).send("Errore esecuzione query "+ err.message);
        client.close();
    })
    
});

app.get("/api/getPerizie", async(req:any, res:any, next:any) => {
    
    const client = new MongoClient(connectionString);
    await client.connect();
    const collection = client.db(DBNAME).collection("perizie");
    let rq : any;
    if(req["query"]["filters"]=="tutti"){
        rq = collection.find({}).toArray();
    }
    else{
        let regex = new RegExp("^"+req["query"]["filters"]+"$", "i");
        rq = collection.find({"codiceOp":regex}).toArray();
    }
    rq.then((data)=>{
        res.send(data);
    })
    rq.catch((err)=>{
        res.status(500).send("Errore esecuzione query "+ err.message);
    })
    rq.finally(()=>{
        client.close();
    })
    

})

app.get("/api/getUsers", async(req:any, res:any, next:any) => {
    const client = new MongoClient(connectionString);
    await client.connect();
    const collection = client.db(DBNAME).collection("utenti");
    let rq = collection.find({}).sort({"admin": -1}).toArray();
    rq.then((data)=>{
        res.send(data);
    })
    rq.catch((err)=>{
        res.status(500).send("Errore esecuzione query "+ err.message);
    })
    rq.finally(()=>{
        client.close();
    })
    

})

app.post("/api/recuperaPwd", async(req:any, res:any, next:any) => {
    let username = "f.pieretto.2292@vallauri.edu";
    let mail = req.body.email;
    let passwordLength = 8;
    let randomPassword = generateRandomPassword(passwordLength);

    message = message.replace("__user", mail).replace("__password", randomPassword);
    
    let mailOptions ={
        "from": username, 
        "to":mail,
        "subject": "Nuova password di accesso",
        "html": message,
        
    }
    transporter.sendMail(mailOptions,function(err, info){
        if(err){
            res.status(500).send("Errore invio mail:\n"+err.message);
        }
        else{
           res.send("Ok") 
        }
    });
    
    let client = new MongoClient(connectionString);
    await client.connect();
    const collection = client.db(DBNAME).collection("utenti");
    let regex = new RegExp("^"+mail+"$", "i");

    let newPassword = _bcryptjs.hashSync(randomPassword, 10);
    let rq = collection.updateOne({"username":regex}, {"$set": {"password": newPassword, "firstAccess": true}});
    rq.then((data)=>{
        console.log("Password recuperata");
    })
    rq.catch((err)=>{
        console.log("Errore aggiornamento password "+ err.message);
        client.close();
    })
    rq.finally(()=>{
        client.close();
    })
    
})

app.patch("/api/updatePerizia", async (req, res, next) => {
    console.log(req.body);
    const client = new MongoClient(connectionString);
    await client.connect();
    const collection = client.db(DBNAME).collection("perizie");
    let codperizia = new ObjectId(req.body._id as string);
    let descrizione = req.body.descrizione;
    let photos = req.body.photos;
    let rq = collection.updateOne({ "_id": codperizia }, { $set: { "descrizione": descrizione , "photos" : photos} });
    rq.then((data) => {
        res.send("ok");
    });
    rq.catch((err) => res.status(500).send(`Errore esecuzione query: ${err.message}`));
    rq.finally(() => client.close());
});

app.delete("/api/deleteUser", async(req:any, res:any, next:any) => {
    const client = new MongoClient(connectionString);
    await client.connect();
    const collection = client.db(DBNAME).collection("utenti");
    let _id = new ObjectId(req.body.id as string);
    let rq = collection.deleteOne({"_id": _id});
    rq.then((data)=>{
        res.send("ok");
    })
    rq.catch((err)=>{
        res.status(500).send("Errore esecuzione query "+ err.message);
    })
    rq.finally(()=>{
        client.close();
    })
});

app.post("/api/addUser", async(req:any, res:any, next:any) => {
    const client = new MongoClient(connectionString);
    await client.connect();
    const collection = client.db(DBNAME).collection("utenti");
    let username = req.body.user;
    let name = req.body.name;
    let surname = req.body.surname;
    let admin = false;
    let firstAccess = true;
    let password = "password";
    let newPassword = _bcryptjs.hashSync(password, 10);

    console.log(username, name, surname, admin, firstAccess, newPassword);

    let regex = new RegExp("^"+username+"$", "i");
    let rq = collection.findOne({"username":regex});
    rq.then((data)=>{
        
        if(data){
            res.status(500).send("Username già esistente");
        }else{
            let rq = collection.insertOne(
                {"nome": name, "cognome":surname,
                "username":username, "password":newPassword, 
                "admin":admin, "firstAccess":firstAccess});
            rq.then((data)=>{
                res.send("ok");
            })
            rq.catch((err)=>{
                res.status(500).send("Errore esecuzione query "+ err.message);
            })
            rq.finally(()=>{
                client.close();
            })
        }
    })
    rq.catch((err)=>{
        res.status(500).send("Errore esecuzione query "+ err.message);
        client.close();
    })
});

app.post("/api/addPerizia", async (req, res, next) => {
    let username = req["payload"].username;
    let newPerizia = req["body"];
    newPerizia.codiceOp = username;
    newPerizia.photos = [];
    console.log(newPerizia);

    const client = new MongoClient(connectionString);
    await client.connect();
    const collection = client.db(DBNAME).collection("perizie");
    let rq = collection.insertOne(newPerizia);
    rq.then((data) => {
        res.send("ok");
    });
    rq.catch((err) => res.status(500).send(`Errore esecuzione query: ${err.message}`));
    rq.finally(() => client.close());
    
});

app.post("/api/savePeriziaOnCloudinary", async (req, res, next) => {
    let username = req["payload"].username;
    
    let photo = req["body"].photo;
    let detail = req["body"].detail;
    _cloudinary.v2.uploader.upload(photo.img, { "folder": "RilieviPerizie" })
        .catch((err) => {
            res.status(500).send(`Error while uploading file on Cloudinary: ${err}`);
        })
        .then(async function (response: UploadApiResponse) {
            delete photo["img"];
            
            photo["img"] = response.secure_url;
            console.log(photo);
            const client = new MongoClient(connectionString);
            await client.connect();
            let collection = client.db(DBNAME).collection("perizie");
            let rq = collection.updateOne({"codiceOp": username, "data" : detail.data, "coordinate":detail.coordinate, "descrizione": detail.descrizione }, { $push: { "photos": photo } });
            rq.then((data) => res.send(data));
            rq.catch((err) => res.status(500).send(`Errore esecuzione query: ${err}`));
            rq.finally(() => client.close());
        });
});

app.get("/api/loadPerizie", async (req, res, next) => {
    let username = req["payload"].username;
    const client = new MongoClient(connectionString);
    await client.connect();
    const collection = client.db(DBNAME).collection("perizie");
    let rq : any;
    let regex = new RegExp("^"+username+"$", "i");
    rq = collection.find({"codiceOp":username}).toArray();
    rq.then((data)=>{
        res.send(data);
    })
    rq.catch((err)=>{
        res.status(500).send("Errore esecuzione query "+ err.message);
    })
    rq.finally(()=>{
        client.close();
    })
});

app.get("/api/getAccess",async (req, res, next) => {
    let username = req["payload"].username;
    const client = new MongoClient(connectionString);
    await client.connect();
    const collection = client.db(DBNAME).collection("utenti");
    let regex = new RegExp("^"+username+"$", "i");
    let rq = collection.findOne({"username":regex},{"projection": {"firstAccess":1, "_id":0}});
    rq.then((data)=>{
        res.send(data);
    })
    rq.catch((err)=>{
        res.status(500).send("Errore esecuzione query "+ err.message);
    })
    rq.finally(()=>{
        client.close();
    })
});

function generateRandomPassword(length: number): string {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+";
    let password = "";
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * charset.length);
      password += charset[randomIndex];
    }
    return password;
}

app.use("/", (req:any, res:any, next:any) => {
    res.status(404);
    if(req.originalUrl.startsWith("/api/"))
        res.send("api non disponibile");
    else
        res.send(paginaErrore);
});

app.use("/",(err,req,res,next)=>{
    console.log("********** SERVER ERROR **********\n",err.stack);
    res.status(500).send(err.message);
})

