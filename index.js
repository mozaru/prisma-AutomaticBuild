#!/usr/bin/env node
const https = require('https'); // or 'https' for https:// URLs
const fs = require('fs');
const request = require('request');
const path = require('path');
const AdmZip = require('adm-zip');
const uuid = require('uuid');
const process = require('process');
const { isMainThread } = require('worker_threads');
const { Console } = require('console');
const chalk=require("chalk");

const URL_BASE = 'https://www.prisma.dev.br/';
//const URL_BASE = 'https://localhost:1080/';

var USER_NAME = process.env.PRISM_DEV_PLAT_EMAIL;
var PASSWORD = process.env.PRISM_DEV_PLAT_PASSWORD;
var INPUT_PATH = process.env.PRISM_DEV_PLAT_INPUT_PATH;
var BUILD_ALL = false;
var QUIET = false;
var LIST_FORMAT = "LINE";
const TEMP_FILE = process.env.PRISM_DEV_PLAT_TEMP_PATH?path.join(process.env.PRISM_DEV_PLAT_TEMP_PATH,'temp.zip'):'temp.zip';

function logInfo(texto)
{
    if (!QUIET)
        console.log(texto);
}
function logError(texto)
{
    if (!QUIET)
        console.error(texto);
}
function showInfo(info)
{
    switch(LIST_FORMAT)
    {
        case "JSON": 
            console.log(JSON.stringify(info));
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
                            console.log(resp);
                        }
                    else
                    {
                        let resp="";
                        for(const x of info)
                            resp = !resp ? x : resp+", "+x;
                        console.log(resp);
                    }
                }
            } else if (typeof info === 'object')
            {
                let resp="";
                for(const x in info)
                    resp = !resp ? info[x] : resp+", "+info[x];
                console.log(resp);
            } else 
                console.log(info);
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
                                console.log(`${x}=${obj[x]}`);
                            console.log();
                        }
                    else
                    {
                        for(const x of info)
                            console.log(x);
                    }
                }
            } else if (typeof info === 'object')
            {
                for(const x in info)
                    console.log(`${x}=${info[x]}`);
            } else 
                console.log(info);
            break;                
    }   
}

if (!USER_NAME || !PASSWORD || !INPUT_PATH) { 
    logError("Falha nos parametros!");

    logError("é obrigatório configurar as variaveis de ambiente:");
    logError('PRISM_DEV_PLAT_EMAIL');
    logError('PRISM_DEV_PLAT_PASSWORD');
    logError('PRISM_DEV_PLAT_INPUT_PATH');

    logError('\nOpcionalmente voce pode configurar o diretorio temporario: PRISM_DEV_PLAT_TEMP_PATH');
    return;
}

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
        logError(`Something happened: ${error}`);
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
            logInfo('filename:',fullName);
    
            if (!fs.existsSync(fullName))
            {
                logInfo('create dir:',fullName);
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
    logInfo("download boilerplat from ",url);
    await downloadFile(url, zipFileName);
    logInfo("extract files to ", outputDir);
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
    var r = new RegExp('^\s*\<[^\>\n]+\>\s','gm');
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
        r = new RegExp('^.*\<[^\>\n]+\>.*','gm');
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

function openPrismaProject(inputDir)
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
    const resp = fs.readFileSync(nomeConfig,'utf-8');
    const config = JSON.parse(resp.replace(/\\r|\\n|\\t/g,''));
    return config;
}

async function analiseBuild(inputDir){
    const original = process.cwd();
    logInfo("Analisando arquivos modificados");
    process.chdir(inputDir);
    const config = openPrismaProject(inputDir);
    const profile = await getProfile(config.profile);
    process.chdir(original);
    let response = [];
    const dict = readBuildFile(path.join(inputDir,".prisma","mzdlbuild"))
    for(const l of profile.layers)
    {
        logInfo(`analisando layer ${l.name}`);
        for(const t of l.transpilers)
        {
            if (fs.existsSync(path.join(inputDir,t.inputPath)))
                for(const file of fs.readdirSync(path.join(inputDir,t.inputPath)))
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
    return response;
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
            for(const file of fs.readdirSync(path.join(inputDir,t.inputPath)))
                if (file.endsWith('.mzdl'))
                {
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
                        const r = await Transpiler(content, t.transpiler, file, variaveis);
                        if (r.message)
                        {
                            logError(r.message);
                            return;
                        }
                        variaveis = r.variaveis;
                        creditos = r.creditos;
                        
                        for(const key in r.files)
                        {
                            const targetName = key===''?(t.outputFile?t.outputFile:path.basename(file, path.extname(file))+"."+r.defaultExtension):key;
                            const baseOutputPath = (t.outputPath===''|| !t.outputPath)?path.join(outputPath,l.outputBasePath):path.join(outputPath,l.outputBasePath, t.outputPath);
                            if (!fs.existsSync(baseOutputPath))
                                fs.mkdirSync(baseOutputPath,{ recursive: true });
                            const fullPathFile = path.join(baseOutputPath,targetName);
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
                }
        }
    }
    writeBuildFile(path.join(inputDir,".prisma","mzdlbuild"),dict);
    writeDicFile(path.join(inputDir,".prisma","vars"),variaveis);
    logInfo(`Creditos: ${creditos}`);    
}


async function callApiPost(url, body){
    return await new Promise((resolve, reject) => {
        let stream = request.post({ url:url, json:body, rejectUnauthorized: false, requestCert: true, headers: {Authorization: access_token?`Bearer ${access_token}`:''} }, 
            (error, res, body) => {
            if (error) reject(error);
            resolve(body);
        });
    })
    .catch(error => {
        logError(`Something happened: ${error}`);
    });
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
        logError(`Something happened: ${error}`);
    });
}

async function login(login, password) {
    logInfo(`logando: ${login}`);
    const body = await callApiPost(URL_BASE+'api/login', { "Login": login, "Password":password });
    creditos = body.creditos;
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

async function Transpiler(source, technicalName, fileName, variaveis){
    source = Buffer.from(source, 'utf-8').toString('base64');
    if (!access_token)
        await login(USER_NAME,PASSWORD);
    let resp = await callApiPost(`${URL_BASE}api/transpile`,{"codeBase64":source, "TechnicalName": technicalName, "InputFileName":fileName, "variaveis":variaveis});
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
    for(const x of analise) {
        linhas += x.lines;
        transpilacoes += x.transpilations;
        linhastranspiladas += x.lines*x.transpilations;
        files++;
    }
    const creditosConsumidos = transpilacoes;
    const saldo = creditos - creditosConsumidos;
    logInfo(chalk.yellow('-----------------------------------------'));
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

function processarParametros() {
    cfg = { ajuda:false, build:true, analise:false, clear:false, buildAll:false, inputDir:null, responseAll:null, download:null, list:null, new:null, forced:false, error:false }
    
    for(const x of process.argv.filter((val, index) => {return index>=2} ))
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
            case '-new': cfg.new = x.substring(x.indexOf('=')+1).trim(); break;
            case '-q': QUIET = true; break;
            case '-json': LIST_FORMAT = "JSON"; break;
            case '-csv': LIST_FORMAT = "CSV"; break;
            default  : logError("chave invalida de configuracao: "+x);
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
    const projectTechnicalName = technicalName(project.name);
    if (fs.existsSync(projectTechnicalName))
    {
        logInfo(`Diretorio ${projectTechnicalName} ja existe! o projeto não será criado!`);
        return;
    }    
    fs.mkdirSync(projectTechnicalName);
    let resp = await callApiGet(`${URL_BASE}api/profile/ByTechnicalName?TechnicalName=${encodeURIComponent(project.profile.name)}`);
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
    }
    if (sameDir)
        fs.writeFileSync(path.join(projectTechnicalName,projectTechnicalName+".prism"), JSON.stringify(configPrisma));
    else
    {
        fs.mkdirSync(path.join(projectTechnicalName,"src-prism"));
        fs.writeFileSync(path.join(projectTechnicalName,"src-prism",projectTechnicalName+".prism"), JSON.stringify(configPrisma));
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
}

async function configNewProject(arg)
{
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
        try{resp = parseInt(resp);}catch(e){ console.log(e,resp);resp=-1};
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
            try{resp = parseInt(resp);}catch(e){ console.log(e,resp);resp=-1};
        }while(isNaN(resp) || resp<0 || resp>=i);
        if (resp==0) return null;
        layer.technology = technologies[resp-1];
        profiles = layer.technology.profiles;
        logInfo(`${layer.name}: ${layer.technology.name} (${layer.technology.version})`);
    }
    if (!profiles || profiles.length==0)
    {
        logError("\n\ninfelizmente nenhum profile foi encrontado!\nPortanto o projeto nao pode ser criado!\n");	
        return null;
    } else if (profiles.length>1)
    {
        logError(`\n\ninfelizmente ${profiles.length} profiles foram encrontados!\nPortanto o projeto nao pode ser criado!\n`);	
        return null;
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
    logInfo("Criando projeto",name);
    return { name:name, profile:profile};
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
        let resp = [];
        for(const layers of await listLayers(arg.trim()))
            resp.push(layers.name);
        showInfo(resp);
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
        else {
            let resp=[];
            for(const technology of await listTecnologies(campos[0].trim(), campos[1].trim()))
                resp.push({name:technology.name, version:technology.version});
            showInfo(resp);
        }
    }
    else
        logError("parametros invalidos para listar\n",arg);
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

async function main()
{
    var config = processarParametros();
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
        logInfo("-new                     create a new project");
        logInfo("-new=<name>              create a new project with name <name>");
        logInfo("-new=<name>,<profile>    create a new project with name <name> with profile <profile>");
        logInfo("-i=<inputdir>          diretorio do projeto a ser transpilado");
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
            createProject(project);
        return;
    } else if (config.list)
    {
        await list(config.list);
        return;
    } else if (config.download)
    {
        await downloadParam(config.download, config.forced, INPUT_PATH);
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
    if (r.length==0){
        logError("Nenhum arquivo foi modificado!");
        return;
    }
    const saldo = mostrarConsumo(r);
    if (saldo<0)
    {
        logError("Creditos insuficientes para fazer a transpilacao!");
        logError("Para transpilar adquira mais creditos em: "+chalk.yellow('https:\\\\www.prisma.dev.br\\creditos'));
        return;
    }
    
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
}



main();