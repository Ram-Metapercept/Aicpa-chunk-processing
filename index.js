const express = require('express');
const path = require('path');
const fs = require('fs');
const { XMLSerializer, DOMParser } = require('@xmldom/xmldom');
const multer = require('multer');
const AdmZip = require('adm-zip');
const shell = require("shelljs");
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
    const outputId = Math.random().toString(36).substring(7);
    const outputFile = path.join(__dirname, 'extracted');
    const extractionDir = path.join(__dirname, 'extracted',outputId);
    const filePath = path.join(__dirname, `${file.path}`);
    if (!fs.existsSync(extractionDir)) {
        fs.mkdirSync(extractionDir);
    }

    try {
        const zip = new AdmZip(file.path);
        zip.extractAllTo(extractionDir, true);
        await cleanInputDirectory(filePath);

        const allFiles = getAllFiles(extractionDir);
        const ditaMapFiles = allFiles.filter((file) => file.endsWith('.ditamap'));
        ditaMapFiles.forEach(processDitaMap);

        fs.readdir(outputFile, (err, files) => {
            if (err) {
              console.error('Error reading output folder:', err);
              return;
            }
            files.forEach(file => {
              let folderPath = path.join(outputFile, file)
              if (file !== outputId) {
                cleanupUploadedZip(folderPath);
              }
            });
          });
        res.status(200).send({ message: "Success", download: `http://localhost:8080/api/download/${outputId}` });
    } catch (err) {
        console.error('Error during extraction:', err);
        res.status(500).send('Error during extraction');
    }
});

function cleanupUploadedZip(FolderDir) {
    try {
      if (fs.existsSync(FolderDir)) {
        shell.rm("-rf", FolderDir);
        console.log("Successfully cleaned up uploaded zip file:", FolderDir);
      } else {
        console.log("Directory does not exist:", FolderDir);
      }
    } catch (error) {
      console.error("Error cleaning up uploaded zip file:", error);
    }
  }
async function cleanInputDirectory(filePath) {
    const directory = path.dirname(filePath);
    try {
      const files = await fs.promises.readdir(directory);
      for (const file of files) {
        if (file !== path.basename(filePath)) {
          const fullPath = path.join(directory, file);
          await fs.promises.unlink(fullPath);
        }
      }
    } catch (err) {
      console.error(`Error cleaning input directory: ${err.message}`);
    }
  }
app.get('/api/download/:downloadId', (req, res) => {
    const downloadId = req.params.downloadId;
    const uploadsDir = path.join(__dirname, "uploads");
  
    fs.readdir(uploadsDir, 'utf8', (err, files) => {
      if (err) {
        console.error('Error reading directory:', err);
        return res.status(500).send('Error reading directory');
      }
      const outputZipPath = path.join(__dirname, files[0]);
      const extractedFile = path.join(__dirname, 'extracted',downloadId);
      const zip = new AdmZip();
  
      zip.addLocalFolder(extractedFile);
      zip.writeZip(outputZipPath);
  
      res.download(outputZipPath, files[0], (err) => {
        if (err) {
          console.error('Error during download:', err);
          res.status(500).send('Error during download');
        } else {
          fs.unlinkSync(outputZipPath);
        }
      });
    });
  });
app.listen(8080, () => {
    console.log('Server started on http://localhost:8080');
});


