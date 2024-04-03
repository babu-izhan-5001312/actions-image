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
                              unique_filename: false,
                              overwrite: true,
                              invalidate: true,
                            };
                        
                            try {
                              // Upload the image
                              const result = await cloudinary.uploader.upload(file, options);
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

        const images = [];
        urls.forEach((url) => {
            if (!url) return;

            images.push({
                alt: 'Image',
                image_url: url.url,
            });
        });
        // --------------------------

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
