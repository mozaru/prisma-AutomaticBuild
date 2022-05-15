# Build automatico do prisma

## abstract
tool for automatic code build on the prism development platform It integrates with the platform website, located at http://www.prisma.dev.br/


## requisitos
precisa estar cadastrado e ativado na plataforma do prisma
[prisma.dev.br](https://prism-dev-platform.herokuapp.com/)

## precisa configurar as variaveis de ambiente

* PRISM_DEV_PLAT_EMAIL         - com o email cadastrado
* PRISM_DEV_PLAT_PASSWORD      - com a senha do usuario
* PRISM_DEV_PLAT_INPUT_PATH    - diretorio local onde estao os arquivos mzdl e o arquivo config.json

## ex no windows:
  set PRISM_DEV_PLAT_EMAIL=meuemail@teste.com
  set PRISM_DEV_PLAT_PASSWORD=minhasenha
  set PRISM_DEV_PLAT_INPUT_PATH=c:\projetos\teste_prima\src_mz

## executar 
  node index.js

# Arquivo de configuracao modelo

este arquivo deve se chamar "config.json" e deve estar na raiz do projeto mzdl
veja um exemplo de projeto (aqui)


~~~
{
    "project":"NOME DO PROJETO ex:Agenda",
    "version":"1.0",
    "author":"Mozar Baptista da Silva",
    "outputRootPath":"../src",
    "inputGit":"",
    "outputGit":"",
    "profile":"fullstack:html5.0-dotnet5.0-sqlite3.0:1.0",
    "constants":{
        "DATA_BASE_TECHONOLOGY":"SQLITE",
        "NAME_SPACE":"NAMESPACE DO PROJETO ex:Agenda",
        "BACKEND_NAME":"NOME DO PROJETO ex:agenda",
        "GUID_PROJ":"auto",
        "GUID_SOL":"auto",
        "GUID_CFG":"auto",
        "GUID_BUILD":"auto",
        "DB_HOST":"",
        "DB_PORT":"",
        "DB_DATABASE":"dados",
        "DB_LOGIN":"",
        "DB_PASSWORD":"",
        "EMAIL_HOST":"smtp.gmail.com",
        "EMAIL_PORT":"587",
        "EMAIL_PROTOCOL":"ssl",
        "EMAIL_USER":"seuemail@gmail.com",
        "EMAIL_PASSWORD":"suasenha",
        "SERVER_HOST":"",
        "OAUTH_CHAVE":"TESTE DE CHAVE DE ACESSO 2022051",
        "OAUTH_CHAVES_VALIDADE":"2",
        "OAUTH_ACCESS_TOKEN_VALIDADE":"40",
        "OAUTH_REFRESH_TOKEN_VALIDADE":"8",
        "OAUTH_TIPO_TOKEN_ACESSO":"Acesso",
        "OAUTH_TIPO_TOKEN_REFRESH":"Refresh",
        "OAUTH_TIPO_TOKEN_DEFAULT":"_OAUTH_TIPO_TOKEN_ACESSO_",
        "OAUTH_PERFIL_PADRAO":"Admin",
        "AD_PATH":"",
        "AD_USUARIO":"",
        "AD_SENHA":""        
    }
}


~~~