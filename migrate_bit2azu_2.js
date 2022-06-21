const
    axios = require('axios'),
    shell = require('shelljs'),
    https = require("https");

// Use dotenv to allow local running with environment variables
require('dotenv').config({ path: '.env' });
const
    BITBUCKET_USER = process.env.BITBUCKET_USER,
    BITBUCKET_PASS = process.env.BITBUCKET_PASS,
    BITBUCKET_SERVER = process.env.BITBUCKET_SERVER,
    BITBUCKET_PROJECT = process.env.BITBUCKET_PROJECT,
    AZURE_SERVER = process.env.AZURE_SERVER,
    AZURE_USER = process.env.AZURE_USER,
    AZURE_PASS = process.env.AZURE_PASS,
    BITBUCKET_BASE_URL = BITBUCKET_SERVER + '/rest/api/1.0',
    AZURE_REPO_BASE_URL = AZURE_SERVER + '/_apis/git'

if (!(BITBUCKET_USER && BITBUCKET_PASS && BITBUCKET_SERVER && BITBUCKET_PROJECT && AZURE_REPO_BASE_URL && AZURE_USER && AZURE_PASS)) {
    console.error('Missing environment values.');
    process.exit(1);
}
// const httpsAgent = new https.Agent({
//     rejectUnauthorized: false
// })

const axiosInstance = axios.create({
    baseURL: BITBUCKET_BASE_URL,
    httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    auth: {
        username: BITBUCKET_USER,
        password: BITBUCKET_PASS
    }
});

const axiosAzureInstance = axios.create({
    baseURL: AZURE_REPO_BASE_URL,
    auth: {
        username: AZURE_USER,
        password: AZURE_PASS
    },
    headers: { 'Content-Type': 'application/json' }
});

const getRepositoryUrl = async (projectName) => {
    const response = await axiosInstance.get('/projects/' + projectName + '/repos?limit=100')
    const repoUrls = []
    if (response.data && response.data.isLastPage) {
        for (const value of response.data.values) {
            const httpUrl = value.links.clone.find(link => link.name === 'http').href
            // console.log(httpUrl)
            repoUrls.push(httpUrl)
            // console.log(repoUrls)
        }
    } else {
        console.log("The number of repositories more than the limit value")
    }
    return repoUrls
}

const createEmptyAzureRepo = async (url) => {
    const repoName = await newRepoName(url)
    const data = { "name": repoName }
    try {
        const response = await axiosAzureInstance.post('/repositories?api-version=6.0', data)
        // console.log('Body: ', response.data);
    } catch (err) {
        console.log(err)
    }
}

// // Change repo name by customer requirement - CapitaStar
// const newRepoName = async (url) => {
//     let repoName = url.split("/").pop().slice(0, -4);
//     repoName = repoName.replace(/_/g,'-');
//     if (!repoName.startsWith("capitastar")){
//         repoName = "capitastar-" + repoName;
//     }
//     return repoName
// }

// Change repo name by customer requirement
const newRepoName = async (url) => {
    let repoName = url.split("/").pop().slice(0, -4);
    return repoName
}

const removeAzureRepo = async (url) => {
    const repoName = await newRepoName(url)
    const repoId = await findRepositoryByName(repoName)
    // console.log(repoId)
    if (repoId) {
        await axiosAzureInstance.delete('/repositories/' + repoId + '?api-version=6.0')
        console.log("Delete success repository " + repoName)
    } else {
        console.log("Fail to delete repository " + repoName)
    }
}

const findRepositoryByName = async (repoName) => {
    const response = await axiosAzureInstance.get('/repositories/?api-version=6.0')
    let repoId = null
    try {
        repoId = response.data.value.find(repo => repo.name === repoName).id
    } catch (error) {
        console.log("Cannot get info about repository " + repoName)
    }
    return repoId
}
const checkLfsEnable = async (url) => {
    const repoName = url.split("/").pop().slice(0, -4)
    let lfsEnable = true;
    await axiosInstance.get(BITBUCKET_SERVER + '/rest/git-lfs/admin/projects/' + BITBUCKET_PROJECT + '/repos/' + repoName + '/enabled').catch(function (error) {
        if (error.response) {
            lfsEnable = false;
        }
    });
    return lfsEnable;
}

const duplicateRepository = async (url, lfsEnable) => {
    const repoName = await newRepoName(url)
    const targetPath = "/tmp/bitbucket/" + BITBUCKET_PROJECT + "/" + repoName + ".git"
    console.log(targetPath)
    console.log(url)
    console.log(targetPath)
    shell.exec("git clone --bare " + url + " " + targetPath)
    console.log("Clone repo " + repoName + " done")
    shell.exec("cd " + targetPath + " && git remote set-url --push origin " + AZURE_SERVER + "/_git/" + repoName)
    if (lfsEnable) {
        shell.exec("cd " + targetPath + " && git lfs fetch --all")
    }
    console.log("Push mirror ")
    shell.exec("cd " + targetPath + " && git push --mirror")

    if (lfsEnable) {
        console.log("LFS-push")
        shell.exec("cd " + targetPath + " && git lfs push --all " + AZURE_SERVER + "/_git/" + repoName)
    }
    shell.exec("rm -rf " + targetPath)
}

const main = async () => {
    try {
        const repoUrls = await getRepositoryUrl(BITBUCKET_PROJECT)
        for (const repoUrl of repoUrls) {
            await createEmptyAzureRepo(repoUrl)
            const lfsEnable = await checkLfsEnable(repoUrl)
            await duplicateRepository(repoUrl, lfsEnable)
            // await removeAzureRepo(repoUrl)
        }

    } catch (error) {
        console.log(error)
    }
}
main()
