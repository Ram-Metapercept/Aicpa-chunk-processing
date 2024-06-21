const express = require('express');
const path = require('path');
const fs = require('fs');
const { XMLSerializer, DOMParser } = require('@xmldom/xmldom');
const multer = require('multer');
const AdmZip = require('adm-zip');
const app = express();

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    },
});

const upload = multer({ storage: storage });
const getAllFiles = (dirPath, arrayOfFiles) => {
    const files = fs.readdirSync(dirPath);

    arrayOfFiles = arrayOfFiles || [];

    files.forEach((file) => {
        if (fs.statSync(path.join(dirPath, file)).isDirectory()) {
            arrayOfFiles = getAllFiles(path.join(dirPath, file), arrayOfFiles);
        } else {
            arrayOfFiles.push(path.join(dirPath, file));
        }
    });

    return arrayOfFiles;
};



const processDitaMap = (filePath) => {
    const content = fs.readFileSync(filePath, 'utf-8');
    const dom = new DOMParser().parseFromString(content, 'application/xml');
    const topicrefs = dom.getElementsByTagName('topicref');

    for (let i = 0; i < topicrefs.length; i++) {
        const href = topicrefs[i].getAttribute('href');
        const format = topicrefs[i].getAttribute('format');

        if (href && href.endsWith('.ditamap') && format === "ditamap") {
            const ditamapPath = path.join(path.dirname(filePath), href);
            
            if (fs.existsSync(ditamapPath)) {
                const ditamapContent = fs.readFileSync(ditamapPath, 'utf-8');
                const domMap = new DOMParser().parseFromString(ditamapContent, 'application/xml');
                const topicrefsMap = domMap.getElementsByTagName('topicref');

                let isChildInGrandparent = false;
                for (let j = 0; j < topicrefsMap.length; j++) {
                    const parentHref = topicrefsMap[j].getAttribute('href');
                    const parentFormat = topicrefsMap[j].getAttribute('format');
                    
                    if (parentHref && parentHref.endsWith('.ditamap') && parentFormat === "ditamap") {
                        isChildInGrandparent = true;
                        break;
                    }
                }

                if (!isChildInGrandparent) {
                    topicrefs[i].setAttribute('chunk', 'to-content');
                    const updatedContent = new XMLSerializer().serializeToString(dom);
                    fs.writeFileSync(filePath, updatedContent, 'utf-8');
                }
            }
        }
    }
};

app.use(express.static('public'));
app.post('/api/processing', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No files were uploaded.');
    }
    const file = req.file;
    const extractionDir = path.join(__dirname, 'extracted');

    if (!fs.existsSync(extractionDir)) {
        fs.mkdirSync(extractionDir);
    }
    try {
        const zip = new AdmZip(file.path);
        zip.extractAllTo(extractionDir, true);


        const allFiles = getAllFiles(extractionDir);
        const ditaMapFiles = allFiles.filter((file) => file.endsWith('.ditamap'));
        ditaMapFiles.forEach(processDitaMap);
        fs.unlinkSync(file.path);
        res.status(200).send({ message: "Success", download: "http://localhost:8080/api/download" });
    } catch (err) {
        console.error('Error during extraction:', err);
        res.status(500).send('Error during extraction');
    }
});

app.get('/api/download', (req, res) => {
    const outputZipPath = path.join(__dirname, 'processed.zip');
    const extractedFile = path.join(__dirname, 'extracted');
    const zip = new AdmZip();
    zip.addLocalFolder(extractedFile);
    zip.writeZip(outputZipPath);

    res.download(outputZipPath, 'processed.zip', (err) => {
        if (err) {
            console.error('Error during download:', err);
            res.status(500).send('Error during download');
        } else {
            fs.unlinkSync(outputZipPath);
        }
    });
});

app.listen(8080, () => {
    console.log('Server started on http://localhost:8080');
});


