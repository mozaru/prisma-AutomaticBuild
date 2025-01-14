#!/usr/bin/env node
const fs = require('fs');
const request = require('request');
const path = require('path');
const process = require('process');

let prismStream = console;



function getAllFiles(dirPath) {
    const files = fs.readdirSync(dirPath);
    const resp = [];
  
    files.forEach((file) => {
      const fullPath = path.join(dirPath, file);
  
      if (fs.statSync(fullPath).isDirectory())
        getAllFiles(fullPath).forEach( (f) => resp.push(path.join(file,f)) );
      else
        resp.push(file);
    });
  
    return resp;
}

function tryrequire(str,defaultResult){
    try{
        return require(str);
    }catch(err){
        return defaultResult;
    }
}

const AdmZip = tryrequire('adm-zip',class {
    constructor() {
        prismStream.error("AdmZip class not implemented!");
    }
    getEntries() {
        return [];
    }
});
const uuid = tryrequire('uuid', {
    v4:function () {
        prismStream.error("uuid method v4 not implemented!");
    }
});
const chalk = tryrequire("chalk", {
    yellow:function(str){return str;},
    red:function(str){return str;},
    green:function(str){return str;}
});

const URL_BASE = 'https://www.prisma.dev.br/';
//const URL_BASE = 'https://localhost:1081/';

var USER_NAME = process.env.PRISM_DEV_PLAT_EMAIL;
var PASSWORD = process.env.PRISM_DEV_PLAT_PASSWORD;
var INPUT_PATH = process.env.PRISM_DEV_PLAT_INPUT_PATH ?? ".";
var BUILD_ALL = false;
var QUIET = false;
var LIST_FORMAT = "LINE";
const TEMP_FILE = process.env.PRISM_DEV_PLAT_TEMP_PATH?path.join(process.env.PRISM_DEV_PLAT_TEMP_PATH,'temp.zip'):'temp.zip';

function throwError(texto){
    throw new Error(texto);
}

function logInfo(texto, forced=false)
{
    if (!QUIET || forced)
        prismStream.log(texto);
}

function logError(erro)
{
    prismStream.log(erro);
    //prismStream.error(erro);
}
function showInfo(info)
{
    switch(LIST_FORMAT)
    {
        case "JSON": 
            logInfo(JSON.stringify(info),true);
            break;
        case "CSV":
            if (Array.isArray(info))
            {
                if (info.length>0)
                {
                    if (typeof info[0] === 'object')
                        for(const obj of info)
                        {
                            let resp="";
                            for(const x in obj)
                                resp = !resp ? obj[x] : resp+", "+obj[x];
                            logInfo(resp,true);
                        }
                    else
                    {
                        let resp="";
                        for(const x of info)
                            resp = !resp ? x : resp+", "+x;
                        logInfo(resp,true);
                    }
                }
            } else if (typeof info === 'object')
            {
                let resp="";
                for(const x in info)
                    resp = !resp ? info[x] : resp+", "+info[x];
                logInfo(resp,true);
            } else 
                logInfo(info,true);
            break;
        default:
            if (Array.isArray(info))
            {
                if (info.length>0)
                {
                    if (typeof info[0] === 'object')
                        for(const obj of info)
                        {
                            for(const x in obj)
                                logInfo(`${x}=${obj[x]}`,true);
                            logInfo("",true);
                        }
                    else
                    {
                        for(const x of info)
                            logInfo(x,true);
                    }
                }
            } else if (typeof info === 'object')
            {
                for(const x in info)
                    logInfo(`${x}=${info[x]}`,true);
            } else 
                logInfo(info,true);
            break;                
    }   
}

if (!USER_NAME || !PASSWORD) { 
    logError("Falha nos parametros!");

    logError("é obrigatório configurar as variaveis de ambiente:");
    logError('PRISM_DEV_PLAT_EMAIL');
    logError('PRISM_DEV_PLAT_PASSWORD');

    logError('\nOpcionalmente voce pode configurar o diretorio temporario: PRISM_DEV_PLAT_TEMP_PATH');
    return;
}

var infoUser={};
var access_token = "";
var creditos = -1;

async function downloadFile(url, outputFileName)
{
    let file = fs.createWriteStream(outputFileName);
    await new Promise((resolve, reject) => {
        let stream = request({
        uri: url,
        headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8,ro;q=0.7,ru;q=0.6,la;q=0.5,pt;q=0.4,de;q=0.3',
            'Cache-Control': 'max-age=0',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.106 Safari/537.36'
        },
        gzip: true
        })
        .pipe(file)
        .on('finish', () => {
            logInfo(`The file is finished downloading.`);
            resolve();
        })
        .on('error', (error) => {
            reject(error);
        })
    })
    .catch(error => {
        throwError(`Something happened: ${error}`);
    });
}


function getAllVariables(txt)
{
    const regexp = new RegExp('#\\w+#','g');
    let variables = [];
    for(const match of txt.matchAll(regexp))
    {
        const name = match[0].trim();
        if (!variables.includes(name))
            variables.push(name);
    }      
    return variables;
}

function extractFiles(outputdir, zipFileName, variables){
    var zip = new AdmZip(zipFileName);
    var zipEntries = zip.getEntries(); // an array of ZipEntry records
    const regexp = RegExp('#\w+#','g');
    for(zipEntry of zipEntries)
    {
        const fullName = path.join(outputdir,zipEntry.entryName);
        if (zipEntry.isDirectory)
        {
            logInfo(`filename: ${fullName}`);
    
            if (!fs.existsSync(fullName))
            {
                logInfo(`create dir: ${fullName}`);
                fs.mkdirSync(fullName,{recursive: true});
            }    
        }
        else if (zipEntry.name!='config.vars')
        {
            let str = zipEntry.getData().toString("utf8");
            let found = false;
            for(const name of getAllVariables(str))
            {
                const variable = name.replace(new RegExp('#','g'),"").trim();
                if (variable in variables)
                {
                    found = true;
                    str = str.replace(new RegExp(name,'g'),variables[variable]);
                }
            }
            if (found)
                fs.writeFileSync(fullName, str);
            else
                fs.writeFileSync(fullName,zipEntry.getData());
        }
    }
}


async function generateLayer(outputDir, variables, url) {
    const zipFileName=TEMP_FILE;
    logInfo(`download boilerplat from ${url}`);
    await downloadFile(url, zipFileName);
    logInfo(`extract files to ${outputDir}`);
    extractFiles(outputDir, zipFileName, variables);
    fs.unlinkSync(zipFileName);
}

/*function getProfile(profile){
    const profiles = JSON.parse(fs.readFileSync("automatic-build.json",'utf-8'));
    for(const p of profiles)
        if (p.profile == profile)
            return p;
    return null;
}*/


function includeExternalFiles(content, inputDir)
{
    var r = new RegExp('^\s*\<[^\>\n]+\>\s*$','gm');
    var match;
    var used=[];
    while (match = r.exec(content))
    {
        const m = match[0];
        const lib = m.trim().replace(/^\<+|\>+$/g, '');
        if (!used.includes(lib))
        {
            used.push(lib);
            const fileName = path.join.apply(null,[inputDir].concat(lib.split('.')))+'.mzdl';
            const contentExt = fs.readFileSync(fileName, 'utf-8');
            content = content.replace(m,contentExt);
        } else 
            content = content.replace(m,'');    
    }
    return content;
}

function countLines(content){
    return content.split('\n').reduce( (count,line) => { return line.trim()?count+1:count; }, 0);
}

function readBuildFile(fullpath){
    if (BUILD_ALL)
        return {};
    var dictionary = {};
    if (fs.existsSync(fullpath)){
        const items = JSON.parse(fs.readFileSync(fullpath,'utf-8'));
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            dictionary[item.transpiler+":"+item.path] = item;
        }
    }

    return dictionary;
}

function writeBuildFile(fullpath, dic){
    const dir = path.dirname(fullpath);
    if (!fs.existsSync(dir))
       fs.mkdirSync(dir,{ recursive: true });
    var vet=[];
    for(const key of Object.keys(dic))
        vet.push(dic[key]);
    fs.writeFileSync(fullpath,JSON.stringify(vet,null, 4),'utf-8');
}

function readDicFile(fullpath){
    var dictionary = {};
    if (fs.existsSync(fullpath)){
        const items = fs.readFileSync(fullpath,'utf-8').split("\n");
        for (var i = 0; i < items.length; i++) {
            const pos = items[i].indexOf(":");
            const key = items[i].substring(0,pos);
            const value = items[i].substring(pos + 1);
            if (key)
                dictionary[key] = value;
        }
    }
    return dictionary;
}

function writeDicFile(fullpath, dic){
    var content="";
    const dir = path.dirname(fullpath);
    if (!fs.existsSync(dir))
       fs.mkdirSync(dir,{ recursive: true });;
    for(const key of Object.keys(dic))
        content += key+':'+dic[key]+"\n";
    fs.writeFileSync(fullpath,content,'utf-8');
}
function clearName(fileName)
{
    return fileName.replace(/[^\w]/g,'_');
}
function saveCacheFile(fullpath, transpiler,  targetName, content)
{
    if (!fs.existsSync(fullpath))
        fs.mkdirSync(fullpath,{ recursive: true });
    const name = path.join(fullpath,clearName(transpiler)+'-'+targetName);
    fs.writeFileSync(name,content,'utf-8');
}

function loadCacheFile(fullpath, transpiler, targetName)
{
    if (!fs.existsSync(fullpath)) return null;
    const name = path.join(fullpath,clearName(transpiler)+'-'+targetName);
    if (!fs.existsSync(name)) return null;
    return fs.readFileSync(name,'utf-8').split("\n");
}

function merge(fullpath, merge, targetName, newContent)
{
    content = loadCacheFile(fullpath, merge.transpiler, targetName);
    newContent = newContent.split('\n');
    if (content){
      line = merge.lineTarget<0?content.length+merge.lineTarget+1:merge.lineTarget-1;
      newContent = content.slice(0,line).concat(newContent.slice(merge.startLineSource-1, merge.endLineSource), content.slice(line));
    }
    return newContent.join('\n');
}

function getProjectFileName(inputDir)
{
    let configs = [];
    for(const file of fs.readdirSync(inputDir))
        if (file.endsWith('.prism'))
            configs.push(path.join(inputDir,file));
    let nomeConfig="";
    if (configs.length==1)
        nomeConfig=configs[0];
    else if (fs.existsSync(path.join(inputDir,"prism.json")))
        nomeConfig=path.join(inputDir,"prism.json");
    else if (fs.existsSync(path.join(inputDir,"prisma.json")))
        nomeConfig=path.join(inputDir,"prisma.json");
    else
        nomeConfig = path.join(inputDir,"config.json");

    if (!fs.existsSync(nomeConfig))
        throwError(`File Project in [${inputDir}] not found!`);
    return nomeConfig;
}

function openPrismaProject(inputDir)
{
    const nomeConfig = getProjectFileName(inputDir);
    const resp = fs.readFileSync(nomeConfig,'utf-8');
    const config = JSON.parse(resp.replace(/\\r|\\n|\\t/g,''));
    return config;
}



async function getUserInfos(){
    const subscriptions = await getSubscription()
    return {
        infoUser:{
            id:infoUser.id,
            name:infoUser.name,
            email:infoUser.email,
            creditos:infoUser.creditos,
            perfil:infoUser.perfil
        },
        subscriptions: subscriptions
    };
}


async function getEspecificationsFromProfile(profileName){
    const profile = await getProfile(profileName);
    let response = [];
    for(const l of profile.layers)
    {
        logInfo(`analisando layer ${l.name}`);
        const botSpecification = l.botSpecification?l.botSpecification:l.transpilers[0].transpiler.replaceAll(":",";").replaceAll("-","_").replaceAll('.',',');
        const commands = await getCommandsSpecification(botSpecification);
        const blockly = await getBlocklySpecifications(botSpecification);
        response.push( { layer: l.name, botSpecification: botSpecification,...commands, blockly: blockly})
    }
    return response;
}

async function getEspecificationsFromProject(){
    const inputDir = process.cwd();
    const config = openPrismaProject(inputDir);
    return getEspecificationsFromProfile(config.profile);
}

function getCurrentConfigProject(){
    const inputDir = process.cwd();
    const config = openPrismaProject(inputDir);
    return config;   
}

async function getCurrentProfile(){
    const inputDir = process.cwd();
    const config = openPrismaProject(inputDir);
    const profile = await getProfile(config.profile);
    return profile;   
}

async function listFiles(){
    const inputDir = process.cwd();
    const config = openPrismaProject(inputDir);
    const profile = await getProfile(config.profile);
    let response = [];
    for(const l of profile.layers)
    {
        logInfo(`analisando layer ${l.name}`);
        for(const t of l.transpilers)
        {
            var layerFolder = response.find( x => x.name==t.inputPath);
            if (!layerFolder)
            {
                layerFolder = { name:l.name, relativePath: path.join(".",path.relative(".",t.inputPath)), files:[] };
                response.push(layerFolder);
            }
            if (fs.existsSync(path.join(inputDir,t.inputPath)))
                for(const file of getAllFiles(path.join(inputDir,t.inputPath)))
                {
                    if (file.endsWith('.mzdl'))
                    {
                        const fullPathFile = path.join(inputDir,t.inputPath,file);
                        const relativePathFile = fullPathFile.substring(inputDir.length)
                        if (!layerFolder.files.includes(relativePathFile))
                            layerFolder.files.push(relativePathFile);
                    }
                }
        }
    }
    return response;
}

async function analiseBuild(inputDir){
    const original = process.cwd();
    logInfo("Analisando arquivos modificados");
    process.chdir(inputDir);
    const config = openPrismaProject(inputDir);
    const profile = await getProfile(config.profile);
    let subscriptions = await getSubscription();
    subscriptions = subscriptions.filter( x => x.technicalName == config.profile );
    const plano = subscriptions.length>0?subscriptions[0].plano:"Playground";
    process.chdir(original);
    let response = [];
    const dict = readBuildFile(path.join(inputDir,".prisma","mzdlbuild"))
    for(const l of profile.layers)
    {
        logInfo(`analisando layer ${l.name}`);
        for(const t of l.transpilers)
        {
            if (fs.existsSync(path.join(inputDir,t.inputPath)))
                for(const file of getAllFiles(path.join(inputDir,t.inputPath)))
                {
                    if (file.endsWith('.mzdl'))
                    {
                        const fullPathFile = path.join(inputDir,t.inputPath,file);
                        const relativePathFile = fullPathFile.substring(inputDir.length)
                        const key = t.transpiler+":"+relativePathFile; 
                        const lastModify = fs.statSync(fullPathFile).mtimeMs;
                        if (!dict[key] || lastModify != dict[key].lastModify)
                        {
                            let fileMZDL = response.find( x => x.fullPath==relativePathFile );
                            fileMZDL = fileMZDL? fileMZDL : { fullPath:relativePathFile, lines:0, transpilations:0, transpilers: []};
                            if (fileMZDL.transpilations==0)
                            {
                                let content = fs.readFileSync(path.join(inputDir,t.inputPath,file), 'utf-8');
                                content = includeExternalFiles(content, path.join(inputDir,t.inputPath));
                                fileMZDL.lines = countLines(content);
                                response.push(fileMZDL);
                            }
                            fileMZDL.transpilations++;
                            fileMZDL.transpilers.push(t.transpiler);
                        }
                    }
                }
        }
    }
    return {
        profile:config.profile,
        subscription:plano,
        transpiles:response
    };
}

function ajustaMergeReferences(profile)
{
    var dic=[];
    for(const l of profile.layers)
        for(const t of l.transpilers)
            dic[t.transpiler] = t;
    for(const l of profile.layers)
        for(const t of l.transpilers)
        {
            if (t.merge && t.merge.transpiler && dic[t.merge.transpiler])
            {
               dic[t.merge.transpiler].cached = true;
               if (!dic[t.merge.transpiler].linkTranspile) 
                    dic[t.merge.transpiler].linkTranspile = [];
               dic[t.merge.transpiler].linkTranspile.push(t);
            }
            if (t.merge && t.merge.transpiler && dic[t.merge.transpiler])
            {
                t.cached = true;
                if (!t.linkTranspile) 
                     t.linkTranspile = [];
                t.linkTranspile.push(dic[t.merge.transpiler]);
             }
         }
}

async function buildProject(inputDir){
    const original = process.cwd();
    process.chdir(inputDir);
    const config = openPrismaProject(inputDir);
    const profile = await getProfile(config.profile);

    ajustaMergeReferences(profile);

    for(const name in config.constants){
        if (name.toLowerCase().startsWith('guid') && config.constants[name]=='auto')
            config.constants[name] = uuid.v4();
    }
    const outputPath = path.resolve(config.outputRootPath);
    logInfo(`outputPath: ${outputPath}`);
    process.chdir(original);
    for(const l of profile.layers)
    {
        logInfo(`processing layer ${l.name}`);
        const baseOutputPath = path.join(outputPath, l.outputBasePath);
        if (l.boilerplate && !fs.existsSync(baseOutputPath))
        {
            logInfo(`create layer ${l.name}`);
            if (!fs.existsSync(baseOutputPath))
                fs.mkdirSync(baseOutputPath,{ recursive: true });
            await generateLayer(baseOutputPath, config.constants, l.boilerplate)
        }
    }
    let creditos=0;
    let variaveis = readDicFile(path.join(inputDir,".prisma","vars"));
    let dict = readBuildFile(path.join(inputDir,".prisma","mzdlbuild"));
    for(const l of profile.layers)
    {
        logInfo(`transpile layer ${l.name}`);
        for(const t of l.transpilers){
            logInfo(`transpile files with: ${t.transpiler}`);
            for(const file of getAllFiles(path.join(inputDir,t.inputPath)))
                if (file.endsWith('.mzdl'))
                {
                    try{
                        const fullPathFile = path.join(inputDir,t.inputPath,file);
                        const relativePathFile = fullPathFile.substring(inputDir.length)
                        const key = t.transpiler+":"+relativePathFile; 
                        const lastModify = fs.statSync(fullPathFile).mtimeMs;
                        if (!dict[key] || lastModify != dict[key].lastModify)
                        {
                            dict[key] = { transpiler: t.transpiler, path: relativePathFile, lastModify:lastModify};
                            logInfo(`transpile file: ${file}`);
                            let content = fs.readFileSync(path.join(inputDir,t.inputPath,file), 'utf-8');
                            content = includeExternalFiles(content, path.join(inputDir,t.inputPath));
                            const r = await Transpiler(content, t.transpiler, file, config.profile, variaveis);
                            if (r.message)
                                throwError(r.message);
                            variaveis = r.variaveis;
                            creditos = r.creditos;
                            
                            for(const key in r.files)
                            {
                                console.log(`key:${key}\nfile:${file}\nt.outputFile:${t.outputFile}\nbase:${path.basename(file, path.extname(file))}`);

                                const targetName = key===''?(t.outputFile?t.outputFile:path.basename(file, path.extname(file))+"."+r.defaultExtension):key;
                                const fileNameWithoutExt = file.replace(path.extname(file),"");
                                const baseOutputPath = ((t.outputPath===''|| !t.outputPath)?path.join(outputPath,l.outputBasePath):path.join(outputPath,l.outputBasePath, t.outputPath)).replaceAll("%filename%",fileNameWithoutExt);
                                console.log(`baseOutputPath:${baseOutputPath}\ntargetName:${targetName}\nt.outputFile:${t.outputFile}\nbase:${path.basename(file, path.extname(file))}`);
                                
                                const fullPathFile = path.join(baseOutputPath,targetName);
                                const dir = path.dirname(fullPathFile)
                                if (!fs.existsSync(dir))
                                    fs.mkdirSync(dir,{ recursive: true }
                                
                                let fileContent = r.files[key];
                                if (t.cached) {
                                    saveCacheFile(path.join(inputDir,".prisma"), t.transpiler, targetName, fileContent);
                                    logInfo(`cache file: ${path.join(baseOutputPath,targetName)}`);
                                }
                                if (t.merge) {
                                    fileContent = merge(path.join(inputDir,".prisma"), t.merge, targetName, fileContent);
                                    fs.writeFileSync(fullPathFile,fileContent,'utf-8');
                                    logInfo(`add content in file: ${path.join(baseOutputPath,targetName)}`);
                                } else {
                                    fs.writeFileSync(fullPathFile,fileContent,'utf-8');
                                    logInfo(`generate file: ${path.join(baseOutputPath,targetName)}`);
                                }
                            }
                        }
                    }catch(error){
                        logError(`Error: transpiling file [${file}] with bot [${t.transpiler}]`);
                        logError(error);
                    }
                }
        }
    }
    writeBuildFile(path.join(inputDir,".prisma","mzdlbuild"),dict);
    writeDicFile(path.join(inputDir,".prisma","vars"),variaveis);
    logInfo(`Creditos: ${creditos}`);    
}


async function callApiPost(url, body){
    let error=false;
    let tentativas = 10;
    let lastError="";
    do {
        error=false;
        tentativas--;
        try{
            return await new Promise((resolve, reject) => {
                let stream = request.post({ url:url, json:body, rejectUnauthorized: false, requestCert: true, headers: {Authorization: access_token?`Bearer ${access_token}`:''} }, 
                    (error, res, body) => {
                    if (error) reject(error);
                    resolve(body);
                });
            })
            .catch(error => {
                throwError(`Something happened: ${error}`);
            });
        }catch(err){
            lastError = err;
            error = true;
        }
    } while(error && tentativas>0);
    throw lastError;
}
async function callApiGet(url){
    return await new Promise((resolve, reject) => {
        let stream = request.get({ url:url, rejectUnauthorized: false, requestCert: true, headers: {Authorization: access_token?`Bearer ${access_token}`:''} }, 
            (error, res, body) => {
            if (error) reject(error);
            resolve(body);
        });
    })
    .catch(error => {
        throwError(`Something happened: ${error}`);
    });
}

async function login(login, password) {
    logInfo(`logando: ${login}`);
    const body = await callApiPost(URL_BASE+'api/login', { "Login": login, "Password":password });
    creditos = body.creditos;
    infoUser = body;
    if (body && body.access_token)
    {
        logInfo("logou!");
        access_token = body.access_token;
    } else {
        logInfo("nao logou!");
        access_token = "";
    }
    /*await new Promise((resolve, reject) => {
        let stream = request.post(URL_BASE+'api/login', { json:{ "Login": login, "Password":password },
        rejectUnauthorized: false,
        requestCert: true        
        }, (error, res, body) => {
            if (error) {
              logError(error);
              access_token="";
              reject(error);
            }
            logInfo(`statusCode: ${res.statusCode}`)
            logInfo(body);
            access_token = body.access_token;
            resolve();
        });
    })
    .catch(error => {
        logError(`Something happened: ${error}`);
    });*/
}

async function getBlocklySpecifications(botSpecification){
    if (!access_token)
        await login(USER_NAME,PASSWORD);
    logInfo(`Baixando Blockly Specifications From Bot Specification: ${botSpecification}`);
    botSpecification = encodeURIComponent(botSpecification);
    let resp = await callApiGet(`${URL_BASE}api/mzdl/BlocklyMenu/${botSpecification}`);
    resp = JSON.parse(resp.replace(/\\r|\\t/g,''));
    logInfo('Blockly Specifications baixado');
    return resp.message;
}
async function getCommandsSpecification(botSpecification){
    if (!access_token)
        await login(USER_NAME,PASSWORD);
    logInfo(`Baixando Commands Specification From Bot Specification: ${botSpecification}`);
    botSpecification = encodeURIComponent(botSpecification);
    let resp = await callApiGet(`${URL_BASE}api/mzdl/specification/${botSpecification}`);
    resp = JSON.parse(resp.replace(/\\r|\\t/g,''));
    logInfo('Commands Specification baixado');
    return resp;
}

async function getSubscription(){
    if (!access_token)
        await login(USER_NAME,PASSWORD);
    let resp = await callApiGet(`${URL_BASE}api/assinatura/subscription`);
    resp = JSON.parse(resp.replace(/\\r|\\t/g,''));
    return resp;
}



async function getProfile(profile){
    if (!access_token)
        await login(USER_NAME,PASSWORD);
    logInfo(`Baixando profile: ${profile}`);
    profile = encodeURIComponent(profile);
    let resp = await callApiGet(`${URL_BASE}api/profile/ByTechnicalName?TechnicalName=${profile}`);
    resp = JSON.parse(resp.replace(/\\r|\\n|\\t/g,''));
    logInfo('Profile baixado');
    return JSON.parse(resp.config);
}

async function Transpiler(source, technicalName, fileName, profile, variaveis){
    source = Buffer.from(source, 'utf-8').toString('base64');
    if (!access_token)
        await login(USER_NAME,PASSWORD);
    let resp = await callApiPost(`${URL_BASE}api/transpile`,{"codeBase64":source, "TechnicalName": technicalName, "InputFileName":fileName, "Profile":profile, "variaveis":variaveis});
    if (resp && resp.files)
        for(const key in resp.files)
            if (resp.files[key]==='')
                delete resp.files[key];
            else
                resp.files[key] = Buffer.from(resp.files[key], 'base64').toString('utf-8');
    return resp;
}

async function listAppTypes()
{
    if (!access_token)
        await login(USER_NAME,PASSWORD);
    let resp = await callApiGet(`${URL_BASE}api/info/apptype`);
    return JSON.parse(resp);
}
async function getAppType(id)
{
    if (!access_token)
        await login(USER_NAME,PASSWORD);
    let resp = await callApiGet(`${URL_BASE}api/info/apptype/${id}`);
    return JSON.parse(resp);
}

async function getAppTypeFromProfile(TechnicalName)
{
    if (!access_token)
        await login(USER_NAME,PASSWORD);
    let resp = await callApiGet(`${URL_BASE}api/info/apptype/FromProfile/${TechnicalName}`);
    return JSON.parse(resp);
}

async function listLayers(appTypeName)
{
    if (!access_token)
        await login(USER_NAME,PASSWORD);
    let resp = await callApiGet(`${URL_BASE}api/info/layers/${encodeURIComponent(appTypeName)}`);
    return JSON.parse(resp);
}
async function listTecnologies(appTypeName, layerName)
{
    if (!access_token)
        await login(USER_NAME,PASSWORD);
    let resp = await callApiGet(`${URL_BASE}api/info/technologies/${encodeURIComponent(appTypeName)}/${encodeURIComponent(layerName)}`);
    return JSON.parse(resp);
}


var readlineSync = require('readline-sync');
const { CENFLG } = require('adm-zip/util/constants');
const { compileFunction } = require('vm');

function mostrarConsumo(analise) {
    let linhas = 0;
    let linhastranspiladas = 0;
    let transpilacoes = 0;
    let files = 0;
    for(const x of analise.transpiles) {
        linhas += x.lines;
        transpilacoes += x.transpilations;
        linhastranspiladas += x.lines*x.transpilations;
        files++;
    }
    const creditosConsumidos = analise.subscription=="Playground"?transpilacoes:0;
    const saldo = creditos - creditosConsumidos;
    logInfo(chalk.yellow('-----------------------------------------'));
    logInfo(`Plano Utilizado: ${analise.subscription}`);
    logInfo(`Team Profile Utilizado: ${analise.profile}`);
    logInfo(`Arquivos Analisados: ${files}`);
    logInfo(`Linhas Analisadas: ${linhas}`);
    logInfo(`Transpilacoes: ${transpilacoes}`);
    logInfo(`Linhas para Transpilar: ${linhastranspiladas}`);
    logInfo(`Creditos a serem consumidos: ${chalk.red(creditosConsumidos)}`);
    logInfo(`Creditos atual: ${chalk.green(creditos)}`);
    let strSaldo;
    if (saldo>0)
        strSaldo = chalk.green(saldo);
    else if (saldo==0)
        strSaldo = chalk.yellow(saldo);
    else
        strSaldo = chalk.red(saldo);
    logInfo(`Creditos saldo: ${strSaldo}`);
    logInfo(chalk.yellow('-----------------------------------------'));
    return saldo;
}

function processarParametros(argv) {
    cfg = { ajuda:false, build:true, analise:false, clear:false, buildAll:false, inputDir:null, responseAll:null, download:null, list:null, new:null, forced:false, error:false,info:null }
    
    for(const x of argv.filter((val, index) => {return index>=2} ))
    {
        const key = (x.indexOf('=')>-1?x.substring(0,x.indexOf('=')):x).toLowerCase();
        switch(key)
        {
            case '-h': cfg.ajuda = true; cfg.build = false;break;
            case '-v': cfg.analise = true; cfg.build = false;break;
            case '-b': cfg.build = true; break;
            case '-c': cfg.clear = true; cfg.build = false;break;
            case '-r': cfg.buildAll = true; break;
            case '-y': cfg.responseAll = 'y'; break;
            case '-n': cfg.responseAll = 'n'; break;
            case '-i': cfg.inputDir = x.substring(x.indexOf('=')+1).trim(); break;
            case '-d': cfg.download = x.substring(x.indexOf('=')+1).trim(); break;
            case '-f': cfg.forced = true;break;
            case '-l': cfg.list = x.substring(x.indexOf('=')+1).trim(); break;
            case '-info': cfg.info = x.substring(x.indexOf('=')+1).trim(); break;
            case '-new': cfg.new = x.substring(x.indexOf('=')+1).trim(); break;
            case '-changeprofile': cfg.changeProfile = x.substring(x.indexOf('=')+1).trim(); break;
            case '-q': QUIET = true; break;
            case '-json': LIST_FORMAT = "JSON"; break;
            case '-csv': LIST_FORMAT = "CSV"; break;
            default  : throwError("chave invalida de configuracao: "+x);
                       cfg.error=true; 
                       break;
        }
    }
    return cfg;
}

function technicalName(name){
    return name.replace(/[^\w\d ]/g,'').replace(/ /g,'-');
}

function gerarChave(comprimento){
    let s = ``;
    const letras = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    while (s.length<comprimento)
    {
        const i = Math.trunc(Math.random()*letras.length);
    	s+=letras[i];
    }
    return s;
}

async function createProject(project)
{
    if (!access_token)
        await login(USER_NAME,PASSWORD);
    const projectTechnicalName = technicalName(project.name);
    if (fs.existsSync(projectTechnicalName))
        throwError(`O Projeto ${projectTechnicalName} ja existe!\no novo projeto não será criado!`);
    fs.mkdirSync(projectTechnicalName);
    let resp = await callApiGet(`${URL_BASE}api/profile/ByTechnicalName?TechnicalName=${encodeURIComponent(project.profileTechnicalName)}`);
    resp = JSON.parse(resp.replace(/\\r|\\n|\\t/g,''));
    let configPrisma = resp.prismaProject;
    configPrisma = configPrisma
        .replaceAll("<PROJECT_NAME>",project.name)
        .replaceAll("<PROJECT_TECHNICAL_NAME>",projectTechnicalName)
        .replaceAll("<USER_NAME>",USER_NAME)
        .replaceAll("<CHAVE_OAUTH>",gerarChave(32));
    configPrisma = JSON.parse(configPrisma);
    const sameDir = configPrisma.outputRootPath=="" || configPrisma.outputRootPath==".";
    for(const name in configPrisma.constants){
        if (name.toLowerCase().startsWith('guid') && configPrisma.constants[name]=='auto')
            configPrisma.constants[name] = uuid.v4();
        else if (name in project.consts)
            configPrisma.constants[name] = project.consts[name];
    }

    const fullNameProject = path.resolve(sameDir?path.join(projectTechnicalName,projectTechnicalName+".prism"):path.join(projectTechnicalName,"src-prism",projectTechnicalName+".prism"));

    if (sameDir)
        fs.writeFileSync(fullNameProject, JSON.stringify(configPrisma));
    else
    {
        fs.mkdirSync(path.join(projectTechnicalName,"src-prism"));
        fs.writeFileSync(fullNameProject, JSON.stringify(configPrisma));
    }
    const profile = JSON.parse(resp.config);
    const inputDir = sameDir?projectTechnicalName:path.join(projectTechnicalName,"src-prism");
    for(const l of profile.layers)
    {
        for(const t of l.transpilers)
        {
            if (!fs.existsSync(path.join(inputDir,t.inputPath)))
                fs.mkdirSync(path.join(inputDir,t.inputPath));
        }
    }
    logInfo("Projeto criado com sucesso!");
    showInfo(fullNameProject);
}

async function changeProfile(arg){
    const argv = arg.split(","); 
    if (argv.length!=1)
    {
        ThrowError(`Formato para troca de profile invalido!`);
    }
    const newProfile = argv[0];
    const configPrisma = openPrismaProject(process.cwd());
    const profile = await getProfile(newProfile);    
    if (!profile)
        ThrowError(`novo profile não encontrado!`); 
    configPrisma.profile = newProfile
    const fullNameProject = getProjectFileName(process.cwd());
    
    fs.writeFileSync(fullNameProject, JSON.stringify(configPrisma));
    const inputDir = path.dirname(fullNameProject);
    for(const l of profile.layers)
    {
        for(const t of l.transpilers)
        {
            if (!fs.existsSync(path.join(inputDir,t.inputPath)))
                fs.mkdirSync(path.join(inputDir,t.inputPath));
        }
    }
    logInfo("Projeto atualizado com sucesso!");
    showInfo("Ok");
}

async function configNewProject(arg)
{
    const argv = arg.split(","); 
    if (argv.length!=0 && argv.length!=3)
    {
        ThrowError(`Formato para criacao de projeto invalido!`);
    }
    if (argv.length==3)
    {
        const name = argv[0];
        const profileTechnicalName=argv[1];
        const arquivoConfig=argv[2];
        var consts = {};
        if (!fs.existsSync(arquivoConfig))
            throwError(`Arquivo de configuracao ${arquivoConfig} nao encontrado`);
        try{
            consts = JSON.parse(fs.readFileSync(arquivoConfig,'utf-8'));
            logInfo(`Criando projeto ${name}`);
            return { name:name, profileTechnicalName:profileTechnicalName, consts: consts };
        }catch(err)
        {
            throwError(err);
        }
    }
    else {
        const AppTypeVet = await listAppTypes();
        logInfo("Criacao de Projeto");
        let i = 1;
        let resp = 0;
        let name = "";
        name = readlineSync.question(`Informe o nome do projeto? `).trim();
        if (!name) return null;
        do{
            i = 1;
            for(const appType of AppTypeVet)
                logInfo(`${i++} - ${appType.name}`);
            resp = readlineSync.question("Informe o numero do tipo do projeto ou 0 para cancelar? ").toLowerCase();
            try{resp = parseInt(resp);}catch(e){ resp=-1 };
        }while(isNaN(resp) || resp<0 || resp>=i);
        if (resp==0) return null;
        const AppType = await getAppType(AppTypeVet[resp-1].id);
        logInfo(`AppType: ${AppType.name}`);
        logInfo(`Camadas: ${AppType.layers.map(x => x.name).join(", ")}`);
        let profiles = null;
        for(const layer of AppType.layers) {
            logInfo(`Para a camada '${layer.name}' escolha a tecnologia a ser utilizada`);
            const technologies=[];
            for(const technology of layer.technologies)
            {
                if (profiles==null || profiles.filter( (x) => x.id==technology.idProfile ).length == 1)
                {
                    const tecVet = technologies.filter( (x) => x.name==technology.name && x.version==technology.version );
                    if (tecVet.length == 0)
                        technologies.push({name:technology.name, version:technology.version, profiles:[{id:technology.idProfile, name:technology.profile}]});
                    else
                        tecVet[0].profiles.push({id:technology.idProfile, name:technology.profile});
                }
            }
            do{
                i = 1;
                for(const technology of technologies)
                logInfo(`${i++} - ${technology.name} (${technology.version})`);
                resp = readlineSync.question(`Informe o numero da tecnologia para a camada '${layer.name}' ou 0 para cancelar? `).toLowerCase();
                try{resp = parseInt(resp);}catch(e){ resp=-1; };
            }while(isNaN(resp) || resp<0 || resp>=i);
            if (resp==0) return null;
            layer.technology = technologies[resp-1];
            profiles = layer.technology.profiles;
            logInfo(`${layer.name}: ${layer.technology.name} (${layer.technology.version})`);
        }
        if (!profiles || profiles.length==0)
        {
            throwError("\n\ninfelizmente nenhum profile foi encrontado!\nPortanto o projeto nao pode ser criado!\n");	
        } else if (profiles.length>1)
        {
            throwError(`\n\ninfelizmente ${profiles.length} profiles foram encrontados!\nPortanto o projeto nao pode ser criado!\n`);	
        }
        const profile = profiles[0];
        logInfo("\n--------------------------------------");
        logInfo(`Resumo do projeto ${name}`);
        logInfo("--------------------------------------");
        for(const layer of AppType.layers)
            logInfo(`${layer.name}: ${layer.technology.name} (${layer.technology.version})`);
        logInfo("--------------------------------------");
        logInfo(`profile selecionado:${profile.name}`);
        logInfo("--------------------------------------\n");
        do{
            resp = readlineSync.question(`Confirma a criacao deste projeto (S/N)? `).toLowerCase();
        }while(resp!='s' && resp!='n' && resp!='y');
        if (resp=='n') return null;
        logInfo(`Criando projeto ${name}`);
        return { name:name, profileTechnicalName:profile.name, consts:{}};
    }
}

async function list(arg)
{
    if (!arg || arg=="-l")
    {
        let resp = [];
        for(const AppType of await listAppTypes())
           resp.push(AppType.name);
        showInfo(resp);
    }
    else if (arg.split(",").length==1)
    {
        if (arg.toLowerCase().trim()=="files")
            showInfo(await listFiles());
        else if (arg.toLowerCase().trim()=="project" || arg.toLowerCase().trim()=="proj" || arg.toLowerCase().trim()=="prj")
            showInfo(getCurrentConfigProject());
        else if (arg.toLowerCase().trim()=="profile")
            showInfo(await getCurrentProfile());
        else{
            let resp = [];
            for(const layers of await listLayers(arg.trim()))
                resp.push(layers.name);
            showInfo(resp);
        }
    }
    else if (arg.split(",").length==2)
    {
        const campos = arg.toLowerCase().split(",");
        if (campos[0]=='all')
        {
            LIST_FORMAT = "JSON";
            const AppType = await getAppType(arg.split(",")[1]);
            showInfo(AppType);
        }
        else if (campos[0]=='profile')
        {
            LIST_FORMAT = "JSON";
            const AppType = await getAppTypeFromProfile(arg.split(",")[1]);
            showInfo(AppType);
        }
        else if (arg.toLowerCase()=="apptype")
        {
            LIST_FORMAT = "JSON";
            const profile = await getCurrentProfile();
            showInfo(await getAppTypeFromProfile(profile.profile));
        }
        else {
            let resp=[];
            for(const technology of await listTecnologies(campos[0].trim(), campos[1].trim()))
                resp.push({name:technology.name, version:technology.version});
            showInfo(resp);
        }
    }
    else if (arg.split(",").length==3)
    {
        const campos = arg.toLowerCase().split(",");
        const projectName = campos[2];
        const projectTechnicalName = technicalName(projectName);
        if (campos[0]=='const')
        {
            if (!access_token)
                await login(USER_NAME,PASSWORD);
            LIST_FORMAT = "JSON";
            const profileName = campos[1];
            let resp = await callApiGet(`${URL_BASE}api/profile/ByTechnicalName?TechnicalName=${encodeURIComponent(profileName)}`);
            if (!resp)
                throwError(`Profile ${profileName} not found!`)
            resp = JSON.parse(resp.replace(/\\r|\\n|\\t/g,''));
            let configPrisma = resp.prismaProject;
            configPrisma = configPrisma
                .replaceAll("<PROJECT_NAME>",projectName)
                .replaceAll("<PROJECT_TECHNICAL_NAME>",projectTechnicalName)
                .replaceAll("<USER_NAME>",USER_NAME)
                .replaceAll("<CHAVE_OAUTH>",gerarChave(32));
            configPrisma=JSON.parse(configPrisma)
            for(const name in configPrisma.constants)
                if (name.toLowerCase().startsWith('guid') && configPrisma.constants[name]=='auto')
                    configPrisma.constants[name] = uuid.v4();
            showInfo(configPrisma.constants);
        }
        else if (campos[0]=='prism')
        {
            if (!access_token)
                await login(USER_NAME,PASSWORD);
            LIST_FORMAT = "JSON";
            const profileName = campos[1];
            let resp = await callApiGet(`${URL_BASE}api/profile/ByTechnicalName?TechnicalName=${encodeURIComponent(profileName)}`);
            if (!resp)
                throwError(`Profile ${profileName} not found!`)
            resp = JSON.parse(resp.replace(/\\r|\\n|\\t/g,''));
            let configPrisma = resp.prismaProject;
            configPrisma = configPrisma
                .replaceAll("<PROJECT_NAME>",projectName)
                .replaceAll("<PROJECT_TECHNICAL_NAME>",projectTechnicalName)
                .replaceAll("<USER_NAME>",USER_NAME)
                .replaceAll("<CHAVE_OAUTH>",gerarChave(32));
            resp.prismaProject = JSON.parse(configPrisma);
            showInfo(resp);
        }
        else {
            throwError("so aceita const ou profile como primeiro argumento");
        }
    }
    else
        throwError("parametros invalidos para listar\n"+arg.join(' | '));
}

async function downloadParam(arg, forced, inputDir)
{
    const original = process.cwd();
    logInfo("download profile");
    process.chdir(inputDir);
    const config = openPrismaProject(inputDir);
    const profile = await getProfile(config.profile);

    for(const name in config.constants){
        if (name.toLowerCase().startsWith('guid') && config.constants[name]=='auto')
            config.constants[name] = uuid.v4();
    }
    const outputPath = path.resolve(config.outputRootPath);
    logInfo(`outputPath: ${outputPath}`);
    process.chdir(original);

    if (arg.toLowerCase()=="all")
    {
        for(const l of profile.layers)
        {
            logInfo(`processing layer ${l.name}`);
            const baseOutputPath = path.join(outputPath, l.outputBasePath);
            if (l.boilerplate && (forced || !fs.existsSync(baseOutputPath)))
            {
                logInfo(`create layer ${l.name}`);
                if (!fs.existsSync(baseOutputPath))
                    fs.mkdirSync(baseOutputPath,{ recursive: true });
                await generateLayer(baseOutputPath, config.constants, l.boilerplate)
            }
        }
    }
    else if (arg.toLowerCase()=="profile")
    {
        showInfo(JSON.stringify(profile));
    }
    else if (arg)
    {
        for(const l of profile.layers)
        if (arg.toLowerCase()==l.name)
        {
            logInfo(`processing layer ${l.name}`);
            const baseOutputPath = path.join(outputPath, l.outputBasePath);
            if (l.boilerplate && (forced || !fs.existsSync(baseOutputPath)))
            {
                logInfo(`create layer ${l.name}`);
                if (!fs.existsSync(baseOutputPath))
                    fs.mkdirSync(baseOutputPath,{ recursive: true });
                await generateLayer(baseOutputPath, config.constants, l.boilerplate)
            }
        }
    }
}

async function showBotEspecification(arg)
{
    LIST_FORMAT = "JSON";
    if (!arg|| arg=="-info")
    {
        let resp = await getEspecificationsFromProject();
        showInfo(resp);
    }
    else if (arg=="user")
    {
        LIST_FORMAT = "JSON";
        let resp = await getUserInfos();
        showInfo(resp);
    }
    else if (arg=="prism" || arg=="config" || arg=="solution")
    {
        LIST_FORMAT = "JSON";
        showInfo(getCurrentConfigProject());
    }
    else if (arg.toLowerCase()=="profile")
    {
        LIST_FORMAT = "JSON";
        showInfo(await getCurrentProfile());
    }
    else if (arg.toLowerCase()=="apptype")
    {
        LIST_FORMAT = "JSON";
        const profile = await getCurrentProfile();
        const AppType = await getAppTypeFromProfile(profile.profile);
        showInfo(AppType);
    }
    else
    {
        let resp = await getEspecificationsFromProfile(arg);
        showInfo(resp);
    }
}

async function run(argv)
{
    try{
        var config = processarParametros(argv);
        if (config.ajuda || config.error)
        {
            logInfo("node start -- <params>");
            logInfo("-h                     esta ajuda");
            logInfo("-v                     analise do codigo");
            logInfo("-b                     build do codigo");
            logInfo("-c                     limpar historico");
            logInfo("-r                     recompilar tudo");
            logInfo("-y                     sempre responder a sim/yes");
            logInfo("-n                     sempre responder a nao/no");
            logInfo("-f                     forced download")
            logInfo("-d=<boilerplat>        download specific boiler plate");
            logInfo("-d=all                 download all boiler plates");
            logInfo("-d=profile             download and show profile");
            logInfo("-l                     list all available template projects");
            logInfo("-l=<template>          list all layers name to template <template>");
            logInfo("-l=<template>,<layer>  list all tecnologies to layer <layer> in template <template>");
            logInfo("-l=files               list all files from project");
            logInfo("-l=profile             get informations from current profile");
            logInfo("-l=apptype             get informations of apptype from current project");
            logInfo("-info=<profile>        get especification commands and blocky from project or profile");
            logInfo("-info=profile          get informations from current profile");
            logInfo("-info=apptype          get informations of apptype from current project");
            logInfo("-info=user             get informations from current user");
            logInfo("-info                  get informations from current project");
            logInfo("-new                     create a new project");
            logInfo("-new=<name>              create a new project with name <name>");
            logInfo("-new=<name>,<profile>    create a new project with name <name> with profile <profile>");
            logInfo("-i=<inputdir>          diretorio do projeto a ser transpilado");
            logInfo("-changeProfile=<profile> para trocar o profile do projeto");
            logInfo("-q                     modo silencioso");
            logInfo("-json                  list em json format");
            logInfo("-csv                   list em csv format");
            logInfo('\n\n');
            return;
        }
        if (config.inputDir)
            INPUT_PATH = config.inputDir;

        //gambi para remover excessos de "path.sep"    
        INPUT_PATH=path.join(INPUT_PATH);
        if (!INPUT_PATH.endsWith(path.sep))
            INPUT_PATH = INPUT_PATH+path.sep;

        if (config.new)
        {
            const project = await configNewProject(config.new);
            if (project!=null)
                await createProject(project);
            return;
        } else if (config.list)
        {
            await list(config.list);
            return;
        } else if (config.download)
        {
            await downloadParam(config.download, config.forced, INPUT_PATH);
            return;
        } else if (config.info)
        {
            await showBotEspecification(config.info);
            return;
        } else if (config.changeProfile)
        {
            await changeProfile(config.changeProfile);
            return;
        }
        
        if (config.clear)
        {
            const file = path.join(INPUT_PATH,".prisma","mzdlbuild");
            if (fs.existsSync(file))
                fs.rmSync(file);
            return;
        }

        if (config.buildAll)
            BUILD_ALL = true;

        const r = await analiseBuild(INPUT_PATH);
        if (r.transpiles.length==0)
            throwError("Nenhum arquivo foi modificado!");
        const saldo = mostrarConsumo(r);
        if (saldo<0)
            throwError("Creditos insuficientes para fazer a transpilacao!\n"+
                       "Para transpilar adquira mais creditos em: "+chalk.yellow('https:\\\\www.prisma.dev.br\\creditos'));
        
        if (config.build)
        {
            let resp;
            if (config.responseAll==null)
                do{
                    resp = readlineSync.question("Deseja realizar as transpilacoes (S/N)? ").toLowerCase();
                }while(resp!="s" && resp!='n' && resp !='y');
            else
                resp = config.responseAll.toLowerCase();
            if (resp=="s" || resp=="y")
                await buildProject(INPUT_PATH);
        }
    }catch(err){
        logError(err);
    }
}

module.exports = {
    run:run,
    setPrismStream:function (obj) { prismStream=obj; },
    setUser : function (email,password) { USER_NAME = email; PASSWORD=password }
};

