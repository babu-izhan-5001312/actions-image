import { readFile } from 'node:fs';
import { basename, extname, parse } from 'node:path';

import fetch from 'node-fetch';
import FormData from 'form-data';

import glob from '@actions/glob';
import core from '@actions/core';
import { context, getOctokit } from '@actions/github';
import { v2 as cloudinary } from 'cloudinary';

const defaultHost = 'cloudinary';

async function run() {
    if (!context.payload.pull_request) {
        return core.setFailed('Failed to run action, only ment for pull requests!');
    }
    3;
    try {
        const token = core.getInput('GITHUB_TOKEN', { required: true });
        const pathGlob = core.getInput('path', { required: true });
        const title = core.getInput('title');
        const IMG_ENDPOINT = core.getInput('uploadHost') || defaultHost;
        const annotationTag = core.getInput('annotationTag') || '[--]';
        const annotationLevel = core.getInput('annotationLevel') || 'notice';
        const cloudName = core.getInput('cloud-name') || process.env.CLOUDINARY_CLOUD_NAME;
        const apiKey = core.getInput('api-key') || process.env.CLOUDINARY_API_KEY;
        const apiSecret = core.getInput('api-secret') || process.env.CLOUDINARY_API_SECRET;

        const octokit = getOctokit(token);
        const globber = await glob.create(pathGlob, { followSymbolicLinks: false, matchDirectories: false });
        const files = await globber.glob();

        if (!files || files.length <= 0) return core.setFailed(`Failed to find files on path {${pathGlob}}`);
        if (!cloudName || !apiKey || !apiSecret) {
            throw new Error('Cloudinary cloud name, api key and api secret are required');
        }

        cloudinary.config({
            cloud_name: cloudName,
            api_key: apiKey,
            api_secret: apiSecret,
            secure: true
        });

        console.log(cloudinary.config());

        // UPLOAD FILES --------------------------
        const urlPromises = files.map(
            (file) =>
                new Promise(async (resolve, reject) => {
                    const imageBaseName = basename(file);
                    console.log(`Uploading file '${imageBaseName}'`);

                    if (IMG_ENDPOINT === defaultHost) {
                            // Use the uploaded file's name as the asset's public ID and 
                            // allow overwriting the asset with new versions
                            const options = {
                              use_filename: true,
                              unique_filename: true,
                              overwrite: true,
                            };
                        
                            try {
                              // Upload the image
                              const result = await cloudinary.uploader.upload(file, options);
                              console.log(result);
                              resolve({
                                file: file,
                                url: result.url
                              });
                            } catch (error) {
                              console.error(error);
                            }
                        return;
                    } else {
                        readFile(file, (err, buffer) => {
                            const form = new FormData();

                            form.append('file', buffer, {
                                name: imageBaseName,
                                filename: imageBaseName,
                            });

                            fetch(IMG_ENDPOINT, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': `image/${extname(file)}`,
                                },
                                body: form,
                            })
                                .then((res) => res.text())
                                .then((url) => {
                                    if (!url.startsWith('http')) {
                                        return reject(`Failed to upload {${file}} : ${url}`);
                                    }

                                    console.log(`Uploaded to ${url}`);
                                    resolve({
                                        file: file,
                                        url: url,
                                    });
                                })
                                .catch(() => reject(`Failed to upload {${file}}`));
                        });
                    }
                }),
        );

        const urls = await Promise.all(urlPromises).catch((err) => {
            core.setFailed(err);
        });

        if (!urls || urls.length <= 0) return core.setFailed(`Failed to upload files to the provider`);
        // --------------------------

        // GENERATE ANNOTATIONS --------------------------
        // const validateBase64 = function (encoded1) {
        //     var decoded1 = Buffer.from(encoded1, 'base64').toString('utf8');
        //     var encoded2 = Buffer.from(decoded1, 'binary').toString('base64');
        //     return encoded1 == encoded2;
        // };

        // const promises = urls.map(
        //     (urlData) =>
        //         new Promise((resolve, reject) => {
        //             const cleanFile = parse(urlData.file).name;
        //             if (!validateBase64(cleanFile)) {
        //                 return resolve({ imageUrl: urlData.url });
        //             }

        //             const base64Decode = Buffer.from(cleanFile, 'base64').toString('ascii');
        //             if (base64Decode.indexOf(annotationTag) === -1) return resolve({ imageUrl: urlData.url });

        //             const fileData = base64Decode.split(annotationTag);
        //             if (!fileData || fileData.length < 1)
        //                 return reject(`Invalid annotation file name, should be {filePath${annotationTag}line:col}`);

        //             // Normalize the path from \\ to / and remove any "./" "/" at start
        //             let filePath = fileData[0].replace(/\\/g, '/').replace('./', '');
        //             if (filePath.startsWith('/')) filePath = filePath.substring(1);

        //             const lineCol = fileData[1].split(':');
        //             if (!lineCol || lineCol.length !== 2) return reject('Invalid annotation file name');

        //             const line = lineCol[0];
        //             const branch = context.payload.pull_request.head.ref;
        //             const fileUrl = `${context.payload.repository.html_url}/blob/${branch}/${filePath}#L${line}`;

        //             return resolve({
        //                 imageUrl: urlData.url,
        //                 data: {
        //                     path: filePath,
        //                     end_line: parseInt(line),
        //                     start_line: parseInt(line),
        //                     annotation_level: annotationLevel,
        //                     message: fileUrl,
        //                 },
        //             });
        //         }),
        // );

        // const annotationData = await Promise.all(promises).catch((err) => core.setFailed(err));
        // if (!annotationData || annotationData.length <= 0) return core.setFailed('Failed to generate comments / annotations');

        const images = [];
        urls.forEach((url) => {
            if (!url) return;

            images.push({
                alt: 'Image',
                image_url: url.url,
            });
        });
        // --------------------------

        // UPLOAD ANNOTATIONS --------------------------
        octokit.rest.checks
            .create({
                head_sha: context.payload.pull_request.head.sha,
                name: '@izhan/actions-image',
                owner: context.repo.owner,
                repo: context.repo.repo,
                completed_at: new Date().toISOString(),
                conclusion: 'success',
                status: 'completed',
                output: {
                    summary: '',
                    title: title,
                    images: images,
                },
            })
            .then(() => {
                console.warn('Done creating annotations');
            })
            .catch((err) => {
                core.setFailed(err.message);
            });
        // --------------------------
    } catch (err) {
        core.setFailed(err.message);
    }
}

run();
