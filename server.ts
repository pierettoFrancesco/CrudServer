import _http from "http";
import _url from "url";
import _fs from "fs";
import _express from "express";
import _dotenv from "dotenv";
import _cors from "cors";

//letture Environment
_dotenv.config({"path":".env"});

//Variabili relative a Mongo
import {MongoClient, ObjectId} from "mongodb";
const DBNAME = process.env.DBNAME;
const app = _express();
const connectionString= process.env.connectionStringAtlas;
//Variabili generiche
const PORT:number = parseInt(process.env.PORT);
let paginaErrore;

// La function di callback viene eseguita ogni volta che arriva una richiesta dal client
const server = _http.createServer((app));

// Il parametro [ipAddress] consente di mettere il server su una delle interfacce della macchina,
// se non viene specificato su tutte le interfacce

server.listen(PORT, () => {
    init();
    console.log(`Il Server è in ascolto sulla porta ${PORT}`)
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
const corsOptions = {
    origin: function(origin, callback) {
        return callback(null, true);
    },
    credentials: true
};
app.use("/", _cors(corsOptions));

//********************************************************************************/
// Routes utente
//********************************************************************************/

/*app.use("/", (req:any, res:any, next:any) => {
    res.send("Richiesta ricevuta correttamente");
});*/

app.get("/api/getCollections",async (req:any, res:any, next:any) => { 
    const client = new MongoClient(connectionString);
    await client.connect();
    let db = client.db(DBNAME);
    // Elenco delle collezioni nel DB
    let rq = db.listCollections().toArray(); 
    rq.then((data) =>  res.send(data));
    rq.catch((err) => {
        res.status(500).send("Errore nella lettura delle collezioni: "+err);
    });
    rq.finally(() => client.close());
});

app.get("/api/:collection",async (req:any, res:any, next:any) => { 
    const client = new MongoClient(connectionString);
    await client.connect();
    let filters = req["query"];
    let selectedCollection = req["params"]["collection"];
    let collection = client.db(DBNAME).collection(selectedCollection);
    console.log(selectedCollection)
    let rq = collection.find(filters).toArray();
    console.log(filters);
    rq.then((data) => {
        res.send(data);
    });
    rq.catch((err) => {
        res.status(500).send("Errore esecuzione query: "+err);
    });
    rq.finally(() => client.close());
});

app.get("/api/:collection/:id",async (req:any, res:any, next:any) => { 
    const client = new MongoClient(connectionString);
    await client.connect();
    let selectedCollection = req["params"]["collection"];
    let id = req["params"]["id"];
    let objId;
    if(ObjectId.isValid(id)){
        objId = new ObjectId(id);
    }
    else{
        objId = id as unknown as ObjectId;
    }
    let collection = client.db(DBNAME).collection(selectedCollection);

    let rq = collection.findOne({"_id":objId});
    rq.then((data) => {
        res.send(data);
    });
    rq.catch((err) => {
        res.status(500).send("Errore esecuzione query: "+err);
    });
    rq.finally(() => client.close());
});


app.post("/api/:collection",async (req:any, res:any, next:any) => {
    const client = new MongoClient(connectionString);
    await client.connect();
    let newRecord = req["body"];
    let selectedCollection = req["params"]["collection"];
    let collection = client.db(DBNAME).collection(selectedCollection);
    console.log(selectedCollection)
    let rq = collection.insertOne(newRecord)
    rq.then((data) => {
        res.send(data);
    });
    rq.catch((err) => {
        res.status(500).send("Errore esecuzione query: "+err);
    });
    rq.finally(() => client.close());
});

app.delete("/api/:collection/:id",async (req:any, res:any, next:any) => {
    const client = new MongoClient(connectionString);
    await client.connect();
    let selectedCollection = req["params"]["collection"];
    let id = req["params"]["id"];
    let objId;
    if(ObjectId.isValid(id)){
        objId = new ObjectId(id);
    }
    else{
        objId = id as unknown as ObjectId;
    }
    let collection = client.db(DBNAME).collection(selectedCollection);

    let rq = collection.deleteOne({"_id":objId});
    rq.then((data) => {
        res.send(data);
    });
    rq.catch((err) => {
        res.status(500).send("Errore esecuzione query: "+err);
    });
    rq.finally(() => client.close());
});

app.delete("/api/:collection",async (req:any, res:any, next:any) => {
    const client = new MongoClient(connectionString);
    await client.connect();
    let selectedCollection = req["params"]["collection"];
    let collection = client.db(DBNAME).collection(selectedCollection);
    let filters = req["body"];
    let rq = collection.deleteMany({filters});
    rq.then((data) => {
        res.send(data);
    });
    rq.catch((err) => {
        res.status(500).send("Errore esecuzione query: "+err);
    });
    rq.finally(() => client.close());
});

app.patch("/api/:collection/:id",async (req:any, res:any, next:any) => {
    const client = new MongoClient(connectionString);
    await client.connect();
    let selectedCollection = req["params"]["collection"];
    let id = req["params"]["id"];
    let objId;
    if(ObjectId.isValid(id)){
        objId = new ObjectId(id);
    }
    else{
        objId = id as unknown as ObjectId;
    }
    let action = req["body"];
    let collection = client.db(DBNAME).collection(selectedCollection);

    let rq = collection.updateOne({"_id":objId},action);
    rq.then((data) => {
        res.send(data);
    });
    rq.catch((err) => {
        res.status(500).send("Errore esecuzione query: "+err);
    });
    rq.finally(() => client.close());
});

app.patch("/api/:collection",async (req:any, res:any, next:any) => {
    const client = new MongoClient(connectionString);
    await client.connect();
    let selectedCollection = req["params"]["collection"];
    let filters= req["body"]["filters"];
    let action = req["body"]["action"];
    let collection = client.db(DBNAME).collection(selectedCollection);

    let rq = collection.updateMany(filters, action);
    rq.then((data) => {
        res.send(data);
    });
    rq.catch((err) => {
        res.status(500).send("Errore esecuzione query: "+err);
    });
    rq.finally(() => client.close());
});

app.put("/api/:collection/:id",async (req:any, res:any, next:any) => {
    const client = new MongoClient(connectionString);
    await client.connect();
    let selectedCollection = req["params"]["collection"];
    let id = req["params"]["id"];
    let objId;
    if(ObjectId.isValid(id)){
        objId = new ObjectId(id);
    }
    else{
        objId = id as unknown as ObjectId;
    }
    let updateRecord = req["body"];
    let collection = client.db(DBNAME).collection(selectedCollection);

    let rq = collection.replaceOne({"_id":objId},updateRecord);
    rq.then((data) => {
        res.send(data);
    });
    rq.catch((err) => {
        res.status(500).send("Errore esecuzione query: "+err);
    });
    rq.finally(() => client.close());
});

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

