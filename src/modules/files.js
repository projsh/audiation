import * as metadata from 'music-metadata'
import time from '../modules/timeformat'
import { writeFile } from 'fs'
//import Jimp from 'jimp'
import { app } from 'electron'

let randomString = length => {
    let text = ''
    let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    for (let i = 0; i < length; i++) {
        text += characters.charAt(Math.floor(Math.random() * characters.length))
    }
    return text
}

export default {
    async addFiles(songs) {
        let path = app.getPath('userData')
        let getData = new Promise(resolve => {
            let toAdd = []
            let imgUsed = []
            songs.forEach(async f => {
                let id =  randomString(10)
                let meta = await metadata.parseFile(f[0]).catch(err => {
                    console.log(err);
                })
                if (!meta) return;
                let metaObj = {
                    title: f[1],
                    artist: 'Unknown Artist',
                    album: 'Unknown Album',
                    duration: 0,
                    path: f[0],
                    id: id,
                    hasImage: 0,
                    trackNum: null,
                    year: null
                }
                if (meta.common.title) metaObj['title'] = meta.common.title
                if (meta.common.artist) metaObj['artist'] = meta.common.artist
                if (meta.common.album) metaObj['album'] = meta.common.album
                if (meta.common.track) metaObj['trackNum'] = `${meta.common.track.no}`
                if (meta.common.year) metaObj['year'] = `${meta.common.year}`
                if (meta.format.duration) metaObj['duration'] = time.timeFormat(meta.format.duration)
                let artistAlbum = `${meta.common.artist}${meta.common.album}`.replace(/[.:<>"*?/{}()'|[\]\\]/g, '_')
                if (meta.common.picture) {
                    metaObj['hasImage'] = 1
                }
                toAdd.push(metaObj)
                if (toAdd.length == songs.length) {
                    resolve(toAdd)
                }
                if (meta.common.picture && imgUsed.indexOf(artistAlbum) == -1) {
                    imgUsed.push(artistAlbum)
                    let pic = meta.common.picture[0]
                    writeFile(`${path}/images/${artistAlbum}.jpg`, pic.data, err => {
                        if (err) console.log(err)
                    })
                }
            })
        })
        return await getData
    }
}