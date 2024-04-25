import _http from "http";
import _url from "url";
import _fs from "fs";
import _express from "express";
import _dotenv from "dotenv";
import _cors from "cors";
//import _nodemailer from "nodemailer";
import _https from "https";
import _bcryptjs from "bcryptjs";
import _jwt from "jsonwebtoken";
const _nodemailer = require("nodemailer");
import { google } from "googleapis";
import _cloudinary, { UploadApiResponse } from "cloudinary";

//letture Environment
_dotenv.config({"path":".env"});

//Configurazione cloudinary
_cloudinary.v2.config({
    cloud_name: process.env.cloud_name,
    api_key: process.env.api_key,
    api_secret: process.env.api_secret
});

//Variabili relative a Mongo
import {MongoClient, ObjectId} from "mongodb";
import { env } from "process";
const DBNAME = process.env.DBNAME;
const app = _express();
const connectionString= process.env.connectionStringAtlas;
//Variabili generiche
const HTTP_PORT:number = parseInt(process.env.PORT);
let paginaErrore;


// Il parametro [ipAddress] consente di mettere il server su una delle interfacce della macchina,
// se non viene specificato su tutte le interfacce

//SERVER HTTPS occorre passare le chiavi RSA (private e public)

const ENCRYPTION_KEY = _fs.readFileSync('./keys/encryptionKey.txt', 'utf8')


const http_server = _http.createServer(app);

http_server.listen(HTTP_PORT, () => {
    init();
    console.log(`Il Server HTTP è in ascolto sulla porta ${HTTP_PORT}`);
});

function init(){
    /*_fs.readFile("./static/error.html",function(err,data){
        if(err){
            paginaErrore = "<h1>Risorsa non trovata</h1>";
        }
        else{
            paginaErrore=data.toString();
        }
    });*/
}
//********************************************************************************/
// Routes middleware
//********************************************************************************/

//1. Request log
app.use("/", (req:any, res:any, next:any) => {
    console.log("-----> "+req.method +": "+ req.originalUrl);
    next();
});

//2. Gestione delle risorse statiche
// .static() è un metodo express che ha già implementata la firma di sopra. Se trova il file fa la send() altrimenti la next()
app.use("/", _express.static("./static"));

//3. Lettura dei parametri Body
//Intercetta solo quelli in formato JSON
app.use("/",_express.json({"limit":"50mb"})); 
//Intercetta solo quelli in formato URL ENCODED
app.use("/",_express.urlencoded({"limit":"50mb","extended":true})); 

//4. Stampa dei parametri GET,BODY
app.use("/", (req:any, res:any, next:any) => {
    if(Object.keys(req["query"]).length>0)
        console.log("      "+JSON.stringify(req["query"]));
    if(Object.keys(req["body"]).length > 0)
        console.log("      "+JSON.stringify(req["body"]));
    next();
});

//5 CORS (Controllo degli accessi)
const whitelist = [
    "http://localhost:3000",
    "https://localhost:3001",
    "http://localhost:4200",    // server angular
    "http://localhost:8100"     // server ionic
   ];

const corsOptions = {
    origin: function(origin, callback) {
    if (!origin) // browser direct call
    return callback(null, true);
    if (whitelist.indexOf(origin) === -1) {
    var msg = `The CORS policy for this site does not
    allow access from the specified Origin.`
    return callback(new Error(msg), false);
    }
    else
    return callback(null, true);
    },
    credentials: true
};
app.use("/", _cors(corsOptions));

// Tramite questa procedura si accettano tutti
/*const corsOptions = {
    origin: function(origin, callback) {
        return callback(null, true);
    },
    credentials: true
};
app.use("/", _cors(corsOptions));*/


//********************************************************************************/
//Configurazione nodemailer
//********************************************************************************/
/*const auth = {
    "user" : process.env.gmailUser,
    "pass" : process.env.gmailPassword,
    }
const transporter = _nodemailer.createTransport({
    "service": "gmail",
    "auth": auth
});
let message = _fs.readFileSync("./message.html","utf8");*/

const o_Auth2= JSON.parse(process.env.oAuthCredential as any)
const OAuth2 = google.auth.OAuth2; // Oggetto OAuth2
const OAuth2Client = new OAuth2(
 o_Auth2["client_id"],
 o_Auth2["client_secret"]
);
OAuth2Client.setCredentials({
 refresh_token:o_Auth2.refresh_token,
});
let message = _fs.readFileSync("./message.html","utf8");


//********************************************************************************/
// Login

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
        console.log(dbUser);
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
    let currentDate = Math.floor(new Date().getTime() / 1000); //Math.floor() tronca al numero più basso
    let payload ={
        "_id" : data["_id"],
        "username" : data["username"],
        //se non esiste data.iat allora mette la data attuale altrementi mette data.iat (Assegna prima varibiale non nulla)
        "iat" : data.iat || currentDate,
        "exp" : currentDate + parseInt(process.env.durataToken)
    }
    let token = _jwt.sign(payload, ENCRYPTION_KEY)
    console.log(token);
    return(token);


}

/*********************************************************************************/
// Controllo token di google
app.post("/api/googleLogin", async(req:any, res:any, next:any) => {
    if(!req.headers["authorization"]){
        res.status(403).send("Token mancante");
    }
    else{
        let token = req.headers["authorization"];
        //Semplice decodifica del token ottenendo il payload in Base64
        let payload = _jwt.decode(token);
        let username = payload["email"];
        const client = new MongoClient(connectionString);
        await client.connect();
        const collection = client.db(DBNAME).collection("mail");
        let regex = new RegExp("^"+username+"$", "i");
        let rq = collection.findOne({"username":regex}, {"projection" : {"username":1}});
        rq.then((dbUser)=>{
            if(!dbUser){
                res.status(403).send("Utente non autorizzato all'accesso");
            }
            else{
                let token = creaToken(dbUser);
                console.log(token);
                res.setHeader("authorization",token)
                //Fa si che venga restituita al client
                res.setHeader("access-control-expose-headers","authorization")
                res.send({"ris": "ok"})
            }
        })
    }
})

/*********************************************************************************/
// Verifica token
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
                    console.log(newToken);
                    res.setHeader("authorization",newToken)
                    //Fa si che venga restituita al client
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




//********************************************************************************/
// Routes utente
//********************************************************************************/

/*app.use("/", (req:any, res:any, next:any) => {
    res.send("Richiesta ricevuta correttamente");
});*/

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

    const accessToken = await OAuth2Client.getAccessToken().catch((err) => res.status(500).send("Errore richiesta access token a Google " + err)); //restituisce una promise
    console.log(accessToken);
    
    const auth = {
        "type":"OAuth2",
        "user":username, 
        "clientId":o_Auth2.client_id,
        "clientSecret":o_Auth2.client_secret,
        "refreshToken":o_Auth2.refresh_token,
        "accessToken":accessToken
    }
    const transporter = _nodemailer.createTransport({
        "service": "gmail",
        "auth": auth,
        "tls": {
            "rejectUnauthorized": false
        }
    });
    let mailOptions ={
        "from": auth.user, 
        "to":mail,
        "subject": "Nuova password di accesso",
        //"html": req.body.message
        "html": message,
        /*"attachments": [{
            "filename": "qrCode.png",
            "path":"./qrCode.png"
        }]*/
    }
    transporter.sendMail(mailOptions,function(err, info){
        if(err){
            res.status(500).send("Errore invio mail:\n"+err.message);
        }
        else{
           res.send("Ok") //ci vuole un JSON, ma stringa e' JSON valido
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
    // modifica la descrizione, ancora da implementare modifica commenti
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

    /*controllo se esiste già lo username */
    console.log(username, name, surname, admin, firstAccess, newPassword);

    let regex = new RegExp("^"+username+"$", "i");
    let rq = collection.findOne({"username":regex});
    rq.then((data)=>{
        console.log(data);
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
    /*rq.finally(()=>{
        client.close();
    })*/
    
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
            // IMPORTANTE FARE = {}
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



/******************************************************************* */
//Default Route e gestione degli errori
/******************************************************************* */

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

