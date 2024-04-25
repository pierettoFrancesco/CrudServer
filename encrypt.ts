// import
import bcrypt from "bcryptjs" // + @types
import {MongoClient, ObjectId}  from "mongodb";
import dotenv from "dotenv";
dotenv.config({ path: ".env" });


const CONNECTION_STRING:string = process.env.connectionStringAtlas;
const DBNAME = process.env.DBNAME;


const client = new MongoClient(CONNECTION_STRING);
let promise = client.connect();
promise.then( () => {
    let collection = client.db(DBNAME).collection("mail");
    let rq = collection.find(  ).toArray()
    rq.then( (data) => {
        //console.log(data);
        let promises =[];
        for (let item of data){
            let regex = new RegExp("^\\$2[aby]\\$10\\$.{53}$");
            if(!regex.test(item["password"])){
                let _id = new ObjectId(item["_id"]);
                let newPassword = bcrypt.hashSync(item["password"], 10);
                let promise = collection.updateOne( {"_id":_id}, {"$set":{"password": newPassword}});
                promises.push(promise);
            }
        }
        //serve per gestire un vettore di promise
        Promise.all(promises).then( (results) => {
            console.log("Aggiornamento completato " + promises.length);
        }).catch( (err) => {
            console.log("Errore aggiornamento password: "+err.message);
        }).finally( () => {
            client.close();
        });
            
    } )
    rq.catch( (err) => {
        console.log("Errore lettura record: "+err);
        //importante perchè se si attiva il catch si DEVE chiudere la connessione
        client.close();
    } )
})
promise.catch( (err) => {
    console.log("Errore connesione al DB: "+err);
} );


