"use strict"

$(document).ready(function() {
    let divIntestazione = $("#divIntestazione")
    let divFilters = $(".card").eq(0)
    let divCollections = $("#divCollections")
    let table = $("#mainTable")
    let divDettagli = $("#divDettagli")
    let currentCollection = "";

    $("#btnAdd").prop("disabled",false);
    divFilters.hide()

	$("#lstHair").prop("selectedIndex", -1);
    getCollections();

    $("#btnFind").on("click", function () {
        let hair = $("#lstHair").val();
        let gender = "";
        let filters={};

        if(divFilters.find("input[type=checkbox]:checked").length == 1)
        {
            gender = divFilters.find("input[type=checkbox]:checked").val();
        }
        if(hair)
            filters["hair"]=hair;
        if(gender)
            filters["gender"]=gender;

        let rq = inviaRichiesta("get",`/api/${currentCollection}`,filters);
        rq.then(function(response){
            console.log(response["data"]);
            getDataCollection(currentCollection,filters);
        })
        rq.catch(errore);
    });

    $("#btnAdd").on("click", function () {
        divDettagli.empty();
        $("<textarea>").appendTo(divDettagli).prop("placeholder",`{"nome": "Pippo"}`)
        $("<button>").addClass("btn btn-success btn-sm").appendTo(divDettagli).text("INVIA").on("click",function(){
            let newRecord=divDettagli.children("textarea").val()
            try{
                newRecord=JSON.parse(newRecord);
            }
            catch(error){
                alert("JSON non valido\n"+error);
                return;
            }
            let rq = inviaRichiesta("post",`/api/${currentCollection}`,newRecord);
            rq.then(function(response){
                console.log(response["data"]);
                alert("Record inserito correttamente");
                getDataCollection(currentCollection);
            });
            rq.catch(errore);
        });
        $("<button>").addClass("btn btn-danger btn-sm").appendTo(divDettagli).text("ANNULLA").on("click",function(){
            divDettagli.empty();
        });
    });


    function getCollections() {
        let rq=inviaRichiesta("get","/api/getCollections");
        rq.then(function(response){
            console.log(response["data"]);
            let label = divCollections.children("label");
            response["data"].forEach(element => {
                let clonedLabel= label.clone().appendTo(divCollections);
                clonedLabel.children("span").text(element["name"]);
                clonedLabel.children("input:radio").on("click", function(){
                    $("#btnAdd").prop("disabled",false);
                    getDataCollection($(this).next("span").text());
                }); //il rischio è che venga assegnato + volte
            });
            label.remove();
        })
        rq.catch(errore);
    }

    function getDataCollection(coll,filters={}){
        let collection = coll;
        currentCollection = collection;
        let rq=inviaRichiesta("get",`/api/${collection}`,filters);
        rq.then(function(response){
            console.log(response["data"]);
            divIntestazione.find("strong").eq(0).text(collection);
            divIntestazione.find("strong").eq(1).text(response["data"].length);
            let _tbody = table.children("tbody").empty();
            response["data"].forEach(element => {
                let tr= $("<tr>").appendTo(_tbody);
                $("<td>").appendTo(tr).text(element["_id"]).on("click",function () {
                    getDetails(element["_id"]);
                });
                let key = Object.keys(element)[1];
                $("<td>").appendTo(tr).text(element[key]).on("click",function () {
                    getDetails(element["_id"]);
                });
                let td=$("<td>").appendTo(tr);
                $("<div>").appendTo(td).on("click",function () {
                    getDetails(element["_id"], "patch");

                });
                $("<div>").appendTo(td).on("click",function () {
                    getDetails(element["_id"], "put");
                });
                $("<div>").appendTo(td).on("click",function () {
                    deleteRecord(element["_id"]);
                });
            });
            if(collection == "unicorns")
                divFilters.show();
            else{
                divFilters.hide();
                divFilters.find("input[type=checkbox]").prop("checked",false);
                $("#lstHair").prop("selectedIndex", -1);
            }  
            divDettagli.empty();
        })
        rq.catch(errore);
    }

    function getDetails(id, method="get"){
        let rq=inviaRichiesta("get",`/api/${currentCollection}/${id}`);
        rq.then(function(response){
            console.log(response["data"]);
            divDettagli.empty();
            if(method == "get"){
                for (let key in response["data"]) {
                    $("<strong>").appendTo(divDettagli).text(key+": ");
                    $("<span>").appendTo(divDettagli).text(JSON.stringify(response["data"][key]));
                    $("<br>").appendTo(divDettagli);
                }
            }
            else{
                delete response["data"]["_id"];
                let textArea=$("<textarea>").appendTo(divDettagli);
                if(method.toLocaleLowerCase() == "patch"){
                    textArea.val(JSON.stringify({"$set": {"residenza" : "Fossano"}},null,3));                }
                else
                    textArea.val(JSON.stringify(response["data"],null,3))
                textArea.css("height",textArea.get(0).scrollHeight+"px");
                $("<button>").addClass("btn btn-success btn-sm").appendTo(divDettagli).text("AGGIORNA").on("click",function(){
                    let updatedRecord=divDettagli.children("textarea").val()
                    try{
                        updatedRecord=JSON.parse(updatedRecord);
                    }
                    catch(error){
                        alert("JSON non valido\n"+error);
                        return;
                    }
                    let rq = inviaRichiesta(method,`/api/${currentCollection}/${id}`,updatedRecord);
                    rq.then(function(response){
                        console.log(response["data"]);
                        alert("Record aggiornato correttamente");
                        getDataCollection(currentCollection);
                    });
                    rq.catch(errore);
                });
                $("<button>").addClass("btn btn-danger btn-sm").appendTo(divDettagli).text("ANNULLA").on("click",function(){
                    divDettagli.empty();
                });
            }
           
        })
        rq.catch(errore);
    }

    function deleteRecord(id){
        if(confirm("Sei sicuro di voler eliminare il record?"))
        {
            let rq=inviaRichiesta("delete",`/api/${currentCollection}/${id}`);
            rq.then(function(response){
                console.log(response["data"]);
                alert("Record eliminato correttamente");
                getDataCollection(currentCollection);
            })
            rq.catch(errore);
        }
        
    }

    $("#test").hide();
    $("#test").on("click", function () {
        let filters={"hair":"blonde","gender":"f"};
        let action={"$inc":{"vampires":10}};
        let rq = inviaRichiesta("patch","/api/unicorns",filters,action);
        rq.then(function(response){
            console.log(response["data"]);
            getDataCollection("unicorns");
        })
        rq.catch(errore);
    });   
});