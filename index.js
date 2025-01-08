#!/usr/bin/env node
const prismaCli = require('./prisma-cli');
const fs = require('fs');
const path = require('path');

function formatDate(date) {
    var d = new Date(date),
        month = '' + (d.getMonth() + 1),
        day = '' + d.getDate(),
        year = d.getFullYear();

    if (month.length < 2) 
        month = '0' + month;
    if (day.length < 2) 
        day = '0' + day;

    return [year, month, day].join('-');
}

function addLog(type, msg){
    const dt = new Date();
    const fileName = path.join(__dirname,"..","..","log-"+formatDate(dt)+".log");
    fs.appendFileSync(fileName,`[${dt.toISOString()}]-[${type}] ${msg}\n`);
}

function log(txt){
    addLog("LOG",txt);
    console.log(txt);
}

function safeStringify(obj, indent = 2)
{
    try {
        return JSON.stringify(obj);
    }catch(err)
    {
        let cache = [];
        const retVal = JSON.stringify(
        obj,
        (key, value) =>
            typeof value === "object" && value !== null
            ? cache.includes(value)
                ? undefined // Duplicate reference found, discard key
                : cache.push(value) && value // Store value in our collection
            : value,
        indent
        );
        cache = null;
        return retVal;
    }
}

function getMessage(erro){
    try{
        if (!erro)
            erro = Error();
        if (erro instanceof Error)
        {
            const obj = {}
            for (const key of Object.getOwnPropertyNames(erro))
                obj[key] = erro[key];
            return safeStringify(obj);
        }
        else if (typeof erro == "string")
            return erro;
        else
            return safeStringify(erro);
    }catch(e){
        return "";
    }
}

function error(msg){
    addLog("ERR",getMessage(msg));
    if (typeof msg == "string")
        console.error(msg);
    else if (msg instanceof Error)
        console.error(msg.message);
    else 
        console.error(msg);
}

/*prismaCli.setPrismStream({
    log:log,
    error:error
})*/

//addLog("CMD", "prism-cli "+process.argv.join(" "));

prismaCli.run(process.argv);
