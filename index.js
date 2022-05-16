const https = require('https'); // or 'https' for https:// URLs
const fs = require('fs');
const request = require('request');
const path = require('path');
const AdmZip = require('adm-zip');
const uuid = require('uuid');
const process = require('process');
const prettier = require("prettier");

const URL_BASE = 'https://prism-dev-platform.herokuapp.com/';
//const URL_BASE = 'https://localhost:1080/';

var USER_NAME = process.env.PRISM_DEV_PLAT_EMAIL;
var PASSWORD = process.env.PRISM_DEV_PLAT_PASSWORD;
var INPUT_PATH = process.env.PRISM_DEV_PLAT_INPUT_PATH;

const TEMP_FILE = process.env.PRISM_DEV_PLAT_TEMP_PATH?path.join(process.env.PRISM_DEV_PLAT_TEMP_PATH,'temp.zip'):'temp.zip';

if (!USER_NAME || !PASSWORD || !INPUT_PATH) { 
    console.error("Falha nos parametros!");

    console.log("é obrigatório configurar as variaveis de ambiente:");
    console.log('PRISM_DEV_PLAT_EMAIL');
    console.log('PRISM_DEV_PLAT_PASSWORD');
    console.log('PRISM_DEV_PLAT_INPUT_PATH');

    console.log('\nOpcionalmente voce pode configurar o diretorio temporario: PRISM_DEV_PLAT_TEMP_PATH');
    return;
}

var access_token = "";

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
            console.log(`The file is finished downloading.`);
            resolve();
        })
        .on('error', (error) => {
            reject(error);
        })
    })
    .catch(error => {
        console.log(`Something happened: ${error}`);
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
            console.log('filename:',fullName);
    
            if (!fs.existsSync(fullName))
            {
                console.log('create dir:',fullName);
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
    console.log("download boilerplat from ",url);
    await downloadFile(url, zipFileName);
    console.log("extract files to ", outputDir);
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

async function buildProject(inputDir){
    const original = process.cwd();
    process.chdir(inputDir);
    const config = JSON.parse(fs.readFileSync(path.join(inputDir,"config.json"),'utf-8'));
    const profile = await getProfile(config.profile);
    for(const name in config.constants){
        if (name.toLowerCase().startsWith('guid') && config.constants[name]=='auto')
            config.constants[name] = uuid.v4();
    }
    const outputPath = path.resolve(config.outputRootPath);
    console.log("outputPath:",outputPath);
    process.chdir(original);
    for(const l of profile.layers)
    {
        console.log("processing layer ",l.name);
        const baseOutputPath = path.join(outputPath, l.outputBasePath);
        if (l.boilerplate && !fs.existsSync(baseOutputPath))
        {
            console.log("create layer ",l.name);
            if (!fs.existsSync(baseOutputPath))
                fs.mkdirSync(baseOutputPath,{ recursive: true });
            await generateLayer(baseOutputPath, config.constants, l.boilerplate)
        }
    }
    let creditos=0;
    for(const l of profile.layers)
    {
        console.log("transpile layer ",l.name);
        for(const t of l.transpilers){
            console.log("transpile files with: ",t.transpiler);
            for(const file of fs.readdirSync(path.join(inputDir,t.inputPath)))
                if (file.endsWith('.mzdl'))
                {
                    console.log("transpile file: ",file);
                    const content = fs.readFileSync(path.join(inputDir,t.inputPath,file), 'utf-8');
                    const r = await Transpiler(content, t.transpiler, file);
                    if (r.message)
                    {
                        console.error(r.message);
                        return;
                    }
                    creditos = r.creditos;
                    for(const key in r.files)
                    {
                        const targetName = key===''?(t.outputFile?t.outputFile:path.basename(file, path.extname(file))+"."+r.defaultExtension):key;
                        const baseOutputPath = (t.outputPath===''|| !t.outputPath)?path.join(outputPath,l.outputBasePath):path.join(outputPath,l.outputBasePath, t.outputPath);
                        if (!fs.existsSync(baseOutputPath))
                            fs.mkdirSync(baseOutputPath,{ recursive: true });
						const fullPathFile = path.join(baseOutputPath,targetName);
						console.log("PRETTIER ",fullPathFile);
						let fileContent = r.files[key];
						fs.writeFileSync(fullPathFile,fileContent,'utf-8');
						try{
						const prettierConfig = await prettier.resolveConfig(fullPathFile);
						console.log("PRETTIER config",prettierConfig);
						fileContent = await prettier.format(fileContent, {endOfLine: 'auto', tabWidth: 4, embeddedLanguageFormatting:'auto', filepath: fullPathFile});
                        fs.writeFileSync(fullPathFile,fileContent,'utf-8');
						}catch(err){}
                        console.log("generate file: ",path.join(baseOutputPath,targetName));
                    }
                }
        }
    }
    console.log("Creditos: ",creditos);    
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
        console.log(`Something happened: ${error}`);
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
        console.log(`Something happened: ${error}`);
    });
}

async function login(login, password) {
    console.log("logando:",login);
    const body = await callApiPost(URL_BASE+'api/login', { "Login": login, "Password":password });
    if (body && body.access_token)
    {
        console.log("logou!");
        access_token = body.access_token;
    } else {
        console.log("nao logou!");
        access_token = "";
    }
    /*await new Promise((resolve, reject) => {
        let stream = request.post(URL_BASE+'api/login', { json:{ "Login": login, "Password":password },
        rejectUnauthorized: false,
        requestCert: true        
        }, (error, res, body) => {
            if (error) {
              console.error(error);
              access_token="";
              reject(error);
            }
            console.log(`statusCode: ${res.statusCode}`)
            console.log(body);
            access_token = body.access_token;
            resolve();
        });
    })
    .catch(error => {
        console.log(`Something happened: ${error}`);
    });*/
}

async function getProfile(profile){
    if (!access_token)
        await login(USER_NAME,PASSWORD);
    console.log('Baixando profile:',profile);
    profile = encodeURIComponent(profile);
    let resp = await callApiGet(`${URL_BASE}api/profile/ByTechnicalName?TechnicalName=${profile}`);
    resp = JSON.parse(resp.replace(/\\n|\\t/g,''));
    console.log('Profile baixado');
    return JSON.parse(resp.config);
}

async function Transpiler(source, technicalName, fileName){
    source = Buffer.from(source, 'utf-8').toString('base64');
    if (!access_token)
        await login(USER_NAME,PASSWORD);
    let resp = await callApiPost(`${URL_BASE}api/transpile`,{"codeBase64":source, "TechnicalName": technicalName, "InputFileName":fileName});
    if (resp && resp.files)
        for(const key in resp.files)
            if (resp.files[key]==='')
                delete resp.files[key];
            else
                resp.files[key] = Buffer.from(resp.files[key], 'base64').toString('utf-8');
    return resp;
}

buildProject(INPUT_PATH);
