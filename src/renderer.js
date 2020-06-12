const app = require('electron').remote.app;
const win = require('electron').remote.getCurrentWebContents();
const remote = require('electron').remote;
const path = require('path');
const Vue = require('vue/dist/vue');
const asyncComputed = require('vue-async-computed');
Vue.use(asyncComputed)
const fs = require('fs');
const drpc = require('discord-rpc');

let list = new Worker('./ftmodules/list.js');
let imgServer = new Worker('./ftmodules/server.js');
let addPlaylist = new Worker('./ftmodules/addplaylist.js');
let audio;
let allSongs = [];
let currentSong;
let currentSongIndex;
let compareListOrder = [];
let nonCurrentView = [];
let currentListViewing = 'Songs';
let lastView = 'Songs';
let curPlayTabTitle = 'All Songs'
let currentlyPlaying = false;
let repeatEnabled = false;
let ver = app.getVersion();

let Controls;
let MediaPlaybackType;
let MediaPlaybackStatus;
let SystemMediaTransportControlsButton;
let BackgroundMediaPlayer;
let RandomAccessStreamReference;
let Uri;

if (process.platform == 'win32') {
    MediaPlaybackStatus = require('@nodert-win10-au/windows.media').MediaPlaybackStatus;
    MediaPlaybackType = require('@nodert-win10-au/windows.media').MediaPlaybackType;
    SystemMediaTransportControlsButton = require('@nodert-win10-au/windows.media').SystemMediaTransportControlsButton;
    BackgroundMediaPlayer = require('@nodert-win10-au/windows.media.playback').BackgroundMediaPlayer;
    RandomAccessStreamReference = require('@nodert-win10-au/windows.storage.streams').RandomAccessStreamReference;
    Uri = require('@nodert-win10-au/windows.foundation').Uri;
    Controls = BackgroundMediaPlayer.current.systemMediaTransportControls;
    Controls.isChannelDownEnabled = false;
    Controls.isChannelUpEnabled = false;
    Controls.isFastForwardEnabled = false;
    Controls.isNextEnabled = true;
    Controls.isPauseEnabled = true;
    Controls.isPlayEnabled = true;
    Controls.isPreviousEnabled = true;
    Controls.isRecordEnabled = false;
    Controls.isRewindEnabled = false;
    Controls.isStopEnabled = false;
    Controls.playbackStatus = MediaPlaybackStatus.closed;
    Controls.displayUpdater.type = MediaPlaybackType.music;

    Controls.on('buttonpressed', (sender, args) => {
        switch(args.button) {
            case SystemMediaTransportControlsButton.play:
                playPause(false)
                break;
            case SystemMediaTransportControlsButton.pause:
                playPause(true)
                break;
            case SystemMediaTransportControlsButton.next:
                skipSong('next')
                break;
            case SystemMediaTransportControlsButton.previous:
                skipSong('prev');
                break;
            default:
                break;
        }
    })    
}

let keyboardControl = () => {
    document.onkeydown = (evt) => {
        switch(event.keyCode) {
            case 32:
                evt.preventDefault();
                if (playPauseButton.paused == true) {
                    playPause(false);
                } else {
                    playPause(true);
                }
                break;
            case 37:
                evt.preventDefault();
                if (evt.ctrlKey) {
                    skipSong('prev');
                } else {
                    if (evt.shiftKey) {
                        audio.currentTime -= 20;
                    } else {
                        audio.currentTime -= 5;
                    }
                }
                break;
            case 39:
                evt.preventDefault();
                if (evt.ctrlKey) {
                    skipSong('next');
                } else {
                    if (evt.shiftKey) {
                        audio.currentTime += 20;
                    } else {
                        audio.currentTime += 5;
                    }
                }
                break;
            case 82:
                if (evt.ctrlKey && evt.shiftKey) {
                    evt.preventDefault();
                    document.querySelector('#repeatButton').click();
                }
                break;
            case 83:
                if (evt.ctrlKey && evt.shiftKey) {
                    evt.preventDefault();
                    document.querySelector('#shuffleButton').click();
                }
        }
    }
}

keyboardControl();

imgServer.postMessage(app.getPath('userData'));

document.title = `Firetail ${ver}`;

let clientId = '586510014211031040';
const rpc = new drpc.Client({
    transport: 'ipc'
});

rpc.login({clientId}).catch(err => {
    console.error(err);
})

let setActivity = (details, smallImg, smallImgTxt, state, songdur) => {
    rpc.setActivity({
        details: details,
        largeImageKey: '051-large',
        largeImageText: `Firetail ${ver} by projsh_`,
        smallImageKey: smallImg,
        smallImageText: smallImgTxt,
        state: state,
        startTimestamp: songdur
    })
}

rpc.on('ready', () => {
    setActivity('Not Playing...', 'pause', 'Paused', '  ', null);
})

//ipc
let ipc = require('electron').ipcRenderer;
ipc.on('msg', (event, args) => {
    let msgType = args[0];
    let data = args[1];
    switch(msgType) {
        case "playpause":
            if (playPauseButton.paused == true) {
                playPause(false);
            } else {
                playPause(true);
            }
            break;
        case "skip":
            skipSong('next');
            break;
        case "prev":
            skipSong('prev');
            break;
        case "shuffle":
            document.querySelector('#shuffleButton').click();
            break;
        case "repeat":
            document.querySelector('#repeatButton').click();
            break;
    }
})

let touch = false;

window.addEventListener('touchstart', () => {
    touch = true;
})

window.addEventListener('touchend', () => {
    setTimeout(() => {
        touch = false;
    },5)
})

let commandInput = new Vue({
    el: '#commandInput',
    methods: {
        focus() {
            console.log('focus')
            document.onkeydown = null;
        },
        unfocus() {
            keyboardControl();
        }
    }
})

/* Song List */
let highlightedSongs = [];
let hlLastClick = 0;
Vue.component('list-item', {
    props: ['song'],
    template: `<li v-on:mouseover="hover" v-on:click="highlight" v-on:mouseleave="leave" v-on:contextmenu="ctxMenu($event); highlight($event);" class="results-link"><i v-on:click="play(true)" v-on:mouseover="hover(true)" v-on:mouseleave="leave" class="material-icons-outlined play-pause" style="opacity: 0;">play_arrow</i><div v-on:dblclick="play(false)" v-on:click="play(false, true)" class="artist-title-album"><p class="list-title">{{ song.title }}</p><p class="list-artist"><span v-on:click="artist">{{song.artist}}</span></p><p class="list-album"><span v-on:click="album">{{song.album}}</span></p></div></li>`,
    methods: {
        play(btn, isTouch) {
            if (isTouch && !touch) return;
            compareListOrder = [];
            nonCurrentView = [];
            listItems.songList.forEach(f => {
                compareListOrder.push(f.id);
                nonCurrentView.push(f);
            });
            lastView = currentListViewing;
            if (this.$vnode.key == currentSong && btn) {
                if (playPauseButton.paused) {
                    playPause(false);
                    this.$el.childNodes[0].textContent = 'pause';
                } else {
                    playPause(true)
                }
                return;
            }
            npTitle.list.title = curPlayTabTitle;
            currentSong = this.$vnode.key;
            currentSongIndex = listItems.songList.indexOf(allSongs[currentSong]);
            if (shuffleEnabled) {
                shuffle(nonCurrentView);
                compareListOrder = [];
                nonCurrentView.forEach(f => {
                    compareListOrder.push(f.id);
                });
            }
            updateActive(btn);
            playSong(currentSong);
        },
        hover(btn) {
            if (this.$vnode.key == currentSong && btn == true && !playPauseButton.paused) {
                if (currentListViewing == lastView) {
                    this.$el.childNodes[0].textContent = 'pause';
                }
            }
            this.$el.childNodes[0].style.opacity = 1;
        },
        leave() {
            if (this.$vnode.key == currentSong) {
                if (currentListViewing == lastView) {
                    if (playPauseButton.paused) {
                        this.$el.childNodes[0].textContent = 'play_arrow';
                        return;
                    }
                    this.$el.childNodes[0].textContent = 'volume_up';
                    return;
                }
            }
            this.$el.childNodes[0].style.opacity = 0;
        },
        artist() {
            getArtist(allSongs[this.$vnode.key].artist);
        },
        album() {
            getAlbum(allSongs[this.$vnode.key].album);
        },
        highlight(e) {
            let newClick = listItems.songList.indexOf(this.song);
            let allElements = document.querySelectorAll('.results-link');
            if (e.type != 'contextmenu' && !e.ctrlKey) {
                document.querySelectorAll('.results-link').forEach(f => {
                    f.classList.remove('highlight')
                })
            } else if (e.type == 'contextmenu' && highlightedSongs.indexOf(newClick) != -1) {
                return;
            } else if (!e.ctrlKey) {
                document.querySelectorAll('.results-link').forEach(f => {
                    f.classList.remove('highlight')
                })
            }
            if (!e.ctrlKey) {
                highlightedSongs = [];
            }
            if (!e.shiftKey) {
                let index = highlightedSongs.indexOf(newClick);
                if (index != -1) {
                    highlightedSongs.splice(index);
                    this.$el.classList.remove('highlight');
                } else {
                    highlightedSongs.push(newClick);
                    this.$el.classList.add('highlight');
                }
                hlLastClick = listItems.songList.indexOf(this.song);
            } else {
                listItems.songList.forEach((item, index) => {
                    if (hlLastClick < newClick) {
                        if (index <= newClick && index >= hlLastClick) {
                            highlightedSongs.push(index);
                        }
                    } else {
                        if (index >= newClick && index <= hlLastClick) {
                            highlightedSongs.push(index);
                        }
                    }
                })
                highlightedSongs.forEach(f => {
                    allElements[f].classList.add('highlight');
                });
            }
            newHighlight = [];
            highlightedSongs.forEach(f => {
                if (newHighlight.indexOf(f) == -1) {
                    newHighlight.push(f);
                }
            });
            highlightedSongs = newHighlight;
        },
        ctxMenu(e) {
            if (currentListViewing == 'Songs') {
                openCtx(e, 'song', this.$vnode.key);
            }
            if (currentListViewing.startsWith('playlist')) {
                openCtx(e, 'playlistSong', this.$vnode.key);
            }
        }
    }
});

document.addEventListener('click', (e) => {
    if (e.target.classList[0] == 'tab-title') {
        let allElements = document.querySelectorAll('.results-link');
        if (highlightedSongs.length != 0) {
            highlightedSongs.forEach(f => {
                allElements[f].classList.remove('highlight');
            });
        }
        highlightedSongs = [];
        hlLastClick = 0;
    }
    document.querySelector('.context-menu').style.display = 'none'
})

let itemClicked;

let openCtx = (e, type, item) => {
    ctxMenu = document.querySelector('.context-menu');
    ctxMenu.style.display = 'block'
    if (e.pageX + ctxMenu.offsetWidth >= window.innerWidth) {
        xPosition = e.pageX - ctxMenu.offsetWidth;
    } else {
        xPosition = e.pageX;
    }
    if (e.pageY + ctxMenu.offsetHeight >= window.innerHeight) {
        yPosition = e.pageY - ctxMenu.offsetHeight;
    } else {
        yPosition = e.pageY;
    }
    switch(type) {
        case "song":
            ctxItems.ctxList = ctxListSong;
            break;
        case "playlist":
            ctxItems.ctxList = ctxListPlaylist;
            break;
        case "playlistSong":
            ctxItems.ctxList = ctxPlaylistItems;
    }
    itemClicked = item;
    ctxMenu.style.left = xPosition + 'px';
    ctxMenu.style.top = yPosition + 'px';
}

let updateActive = (btn) => {
    try {
        document.querySelectorAll('.results-link').forEach(f => {
            f.classList.remove('active');
            f.childNodes[0].style.opacity = 0;
            f.childNodes[0].textContent = 'play_arrow';
            f.childNodes[0].id = '';
        });
        let el = document.querySelector('.list-wrapper').childNodes[currentSongIndex + 2];
        el.classList.add('active');
        el.childNodes[0].id = 'active';
        if (btn) {
            el.childNodes[0].textContent = 'pause';
        } else {
            el.childNodes[0].textContent = 'volume_up';
        }
        el.childNodes[0].style.opacity = 1;
    } catch(err) {
        'lmao'
    }
}

let listItems = new Vue({
    el: ".list-wrapper",
    data: {
        songList: []
    }
});

list.postMessage({'userData': app.getPath('userData'), 'playlist': null});

albumListBack = [];
artistListBack = [];

list.onmessage = async (message) => {
    if (!message.data) {
        listItems.songList = [];
        document.querySelector('.load-spinner').style.display = 'none';
        listTitle.list.count = "0 songs"
        return document.querySelector('.no-songs-found').style.display = 'block';
    } else {
        document.querySelector('.no-songs-found').style.display = 'none';
    }
    artistListBack = message.data[1];
    albumListBack = message.data[2];
    songs = message.data[0];
    allSongs = [];
    songs.forEach(f => {
        allSongs.push(f);
    });
    listItems.songList = songs;
    compareListOrder = [];
    nonCurrentView = [];
    updateListOrder('artist');
    if (currentlyPlaying) {
        listItems.songList.forEach(f => {
            compareListOrder.push(f.id);
            nonCurrentView.push(f);
        });
        if (shuffleEnabled) {
            shuffle(nonCurrentView);
            compareListOrder = [];
            nonCurrentView.forEach(f => {
                compareListOrder.push(f.id);
            });
        }
    }
    document.querySelector('.load-spinner').style.display = 'none';
}

let sortArray = (array, sortBy) => {
    function compare(a, b) {
        if (a[sortBy].toLowerCase() < b[sortBy].toLowerCase()) return -1;
        if (a[sortBy].toLowerCase() > b[sortBy].toLowerCase()) return 1;
    }
    return array.sort(compare);
}

let simpleSort = (array) => {
    function compare(a, b) {
        if (a.toLowerCase() < b.toLowerCase()) return -1;
        if (a.toLowerCase() > b.toLowerCase()) return 1;
    }
    return array.sort(compare);
}

let shuffle = (array) => {
    return array.sort(() => Math.random() - 0.5);
}

let updateListOrder = async (sortBy, compUpdate) => {
    let allElements = document.querySelectorAll('.results-link');
    if (highlightedSongs.length != 0) {
        highlightedSongs.forEach(f => {
            allElements[f].classList.remove('highlight');
        });
    }
    highlightedSongs = [];
    hlLastClick = 0;
    let bruhbruh
    if (sortBy) {
        bruhbruh = new Promise(resolve => {
            let sortByOrder = {};
            listItems.songList.forEach(f => {
                if (sortByOrder[f[sortBy]] == undefined) {
                    sortByOrder[f[sortBy]] = [];
                } 
                sortByOrder[f[sortBy]].push(f);
            });
            let sortKeys = simpleSort(Object.keys(sortByOrder));
            let finalSongArray = [];
            sortKeys.forEach(f => {
                sortByOrder[f] = sortArray(sortByOrder[f], 'title');
                sortByOrder[f].forEach(f => {
                    finalSongArray.push(f);
                })
            })
            listItems.songList = finalSongArray;
            resolve(true);
        });
        await bruhbruh;
    }
    let usePlural = 'songs';
    if (listItems.songList.length == 1) {
        usePlural = 'song'
    }
    listTitle.list.count = `${listItems.songList.length} ${usePlural}`;
    if (compUpdate == true) {
        compareListOrder = [];
        nonCurrentView = [];
        listItems.songList.forEach(f => {
            compareListOrder.push(f.id);
            nonCurrentView.push(f);
        });
    }
    document.querySelectorAll('.results-link').forEach(f => {
        f.classList.remove('active');
        f.childNodes[0].style.opacity = 0;
        f.childNodes[0].textContent = 'play_arrow';
        f.childNodes[0].id = '';
    });
    if (currentSong != undefined) {
        if (currentListViewing == lastView) {
            let findSong = listItems.songList.indexOf(allSongs[currentSong])
            let el = document.querySelector('.list-wrapper').childNodes[findSong + 2];
            if (el) {
                el.classList.add('active');
                el.childNodes[0].id = 'active';
                el.childNodes[0].textContent = 'volume_up';
                el.childNodes[0].style.opacity = 1;
            }
        }
    }
}

/* Play Song */
function timeFormat(s) {
    let min = Math.floor(s / 60);
    let sec = Math.floor(s - (min * 60));
    if (sec < 10){ 
        sec = `0${sec}`;
    }
    return `${min}:${sec}`;
}

let artTimeout;

let playSong = async (songId) => {
    clearTimeout(artTimeout);
    let albumArtEl = document.querySelector('.song-album-art');
    let songFile = allSongs[songId].file;
    let songTitle = allSongs[songId].title;
    let songArtist = allSongs[songId].artist;
    let songAlbum = allSongs[songId].album;
    if (audio) {
        audio.removeEventListener('timeupdate', timeUpdate);
        audio.addEventListener('ended', onEnd);
        audio.src = songFile;        
    } else {
        audio = new Audio(songFile);
    }
    currentlyPlaying = true;
    audio.play();
    playPause(false, true);
    audio.addEventListener('timeupdate', timeUpdate);
    audio.addEventListener('ended', onEnd);
    songInfo.title = songTitle;
    songInfo.artist = songArtist;
    songInfoSmallNp.title = songTitle;
    songInfoSmallNp.artist = songArtist;
    setActivity(songTitle, 'play', 'Playing', `by ${songArtist}`, Date.now());
    if (process.platform == 'win32') {
        Controls.playbackStatus = MediaPlaybackStatus.playing;
        Controls.displayUpdater.musicProperties.title = songTitle;
        Controls.displayUpdater.musicProperties.artist = songArtist;
        Controls.displayUpdater.musicProperties.albumTitle = songAlbum;
        Controls.displayUpdater.update();
    }
    let albumName = allSongs[songId].album.replace(/[.:<>"*?/{}()'|[\]\\]/g, "_");
    let img = `http://localhost:56743/${albumName}.jpg`
    new Promise(resolve => {
        let request = new XMLHttpRequest();
        request.open('GET', img, true);
        request.onload = function(e) {
            if (e.target.status == 200) {
                resolve(true);
            } else {
                resolve(false);
            }
        }
        request.send();
    }).then(exists => {
        if (exists == false) {
            img = path.join(__dirname, '../assets/no_image.svg').replace(/[\\]/g, "/");
        }
        artTimeout = setTimeout(() => {
            albumArtEl.style.backgroundImage = "url('" + img.replace(/[']/g, "\\'") + "')";
            if (process.platform == 'win32') {
                Controls.displayUpdater.thumbnail = RandomAccessStreamReference.createFromUri(new Uri(`http://localhost:56743/${albumName}.jpg`));
                Controls.displayUpdater.update();
            }
        }, 200)
    });
}

/* Song Info */
let songInfo = new Vue({
    el: ".song-info",
    data: {
        title: 'No song playing',
        artist: ''
    }
});

let songInfoSmallNp = new Vue({
    el: ".small-np-meta",
    data: {
        title: 'No song playing',
        artist: ''
    }
});

let onEnd = () => {
    if (repeatEnabled == true) {
        audio.currentTime = 0;
        setTimeout(() => {
            audio.play();
        }, 10)
    } else {
        skipSong('next');
    }
}

/* Controls */
let timeUpdate = () => {
    if (isNaN(audio.duration) == true) {
        document.getElementById('songDurationLength').innerHTML = `-:--`
    } else {
        duration = timeFormat(audio.duration);
        document.getElementById('songDurationLength').innerHTML = duration
    }
    let p = audio.currentTime / audio.duration;
    document.querySelector('#seekFill').style.width = p * 100 + '%';
    let songLength = parseInt(audio.currentTime);
    timeNow = timeFormat(songLength);
    document.getElementById('songDurationTime').innerHTML = timeNow;
}

let shuffleEnabled = false;

let skipSong = (action) => {
    if (action == 'next') {
        currentSongIndex = compareListOrder.indexOf(currentSong) + 1;
        if (currentSongIndex >= compareListOrder.length) currentSongIndex = 0;
    } else if (action == 'prev') {
        currentSongIndex = compareListOrder.indexOf(currentSong) - 1;
        if (currentSongIndex == -1) currentSongIndex = nonCurrentView.length - 1;
    }
    currentSong = nonCurrentView[currentSongIndex].id;
    document.querySelectorAll('.results-link').forEach(f => {
        f.classList.remove('active');
        f.childNodes[0].style.opacity = 0;
        f.childNodes[0].textContent = 'play_arrow';
        f.childNodes[0].id = '';
    });
    let findSong = listItems.songList.indexOf(allSongs[currentSong])
    if (currentListViewing == lastView) {
        let el = document.querySelector('.list-wrapper').childNodes[findSong + 2];
        if (el) {
            el.classList.add('active');
            el.childNodes[0].id = 'active';
            el.childNodes[0].textContent = 'volume_up';
            el.childNodes[0].style.opacity = 1;
        }
    }
    playSong(currentSong);
}

let playPauseButton = new Vue({
    el: '#playPauseBtn',
    data: {
        icon: 'play_arrow',
        paused: true
    },
    methods: {
        click() {
            if (playPauseButton.paused == true) {
                playPause(false);
            } else {
                playPause(true);
            }
        }
    }
});

new Vue({
    el: '#prevButton',
    methods: {
        click() {
            skipSong('prev')
        }
    }
});

new Vue({
    el: '#nextButton',
    methods: {
        click() {
            skipSong('next')
        }
    }
})

new Vue({
    el: '#shuffleButton',
    methods: {
        click() {
            if (shuffleEnabled == false) {
                shuffle(nonCurrentView);
                document.querySelector('#shuffleButton').classList.add('active');
                shuffleEnabled = true;
            } else {
                let sortByOrder = {};
                nonCurrentView.forEach(f => {
                    if (sortByOrder[f['artist']] == undefined) {
                        sortByOrder[f['artist']] = [];
                    } 
                    sortByOrder[f['artist']].push(f);
                });
                let sortKeys = simpleSort(Object.keys(sortByOrder));
                let finalSongArray = [];
                sortKeys.forEach(f => {
                    sortByOrder[f] = sortArray(sortByOrder[f], 'title');
                    sortByOrder[f].forEach(f => {
                        finalSongArray.push(f);
                    })
                })
                nonCurrentView = finalSongArray;
                document.querySelector('#shuffleButton').classList.remove('active');
                shuffleEnabled = false;
            }
            compareListOrder = [];
            nonCurrentView.forEach(f => {
                compareListOrder.push(f.id);
            });
        }
    }
})

new Vue({
    el: '#repeatButton',
    methods: {
        click() {
            if (!repeatEnabled) {
                document.querySelector('#repeatButton').classList.add('active');
                repeatEnabled = true;
            } else {
                document.querySelector('#repeatButton').classList.remove('active');
                repeatEnabled = false;
            }
        }
    }
})

let playPause = (pause, listbtn) => {
    let psong = allSongs[currentSong];
    if (pause == true) {
        playPauseButton.paused = true;
        playPauseButton.icon = 'play_arrow';
        try {
            if (!listbtn) {
                document.querySelector('#active').textContent = 'play_arrow';
            }
        } catch(err) {
            'doesnt exist'
        }
        if (process.platform == 'win32') {
            Controls.playbackStatus = MediaPlaybackStatus.paused;
        }
        setActivity(psong.title, 'pause', 'Paused', `by ${psong.artist}`, null);
        audio.pause();
    } else {
        playPauseButton.paused = false;
        playPauseButton.icon = 'pause';
        try {
            if (!listbtn) {
                document.querySelector('#active').textContent = 'volume_up';
            }
        } catch(err) {
            'doesnt exist'
        }
        if (process.platform == 'win32') {
            Controls.playbackStatus = MediaPlaybackStatus.playing;
        }
        let curDate = new Date;
        setActivity(psong.title, 'play', 'Playing', `by ${psong.artist}`, Math.round((curDate.getTime() / 1000) - audio.currentTime));
        audio.play();
    }
}

/* Seek bar */
let seekBar;
let seekBarWrapper;
let seekFillBar;
setTimeout(() => {
    seekBar = document.querySelector('.seek-bar');
    seekBarWrapper = document.querySelector('#seekWrapper');
    seekFillBar = document.querySelector('#seekFill');
}, 50)
let seekMouseDown = false;

function clamp(min, val, max) {
    return Math.min(Math.max(min, val), max);
}

function getP(e, el) {
    pBar = (e.clientX - el.getBoundingClientRect().x) / el.clientWidth;
    pBar = clamp(0, pBar, 1);
    return pBar;
}

function mousetouchdown(e) {
    if (currentlyPlaying) {
        if (e.touches) {
            e = e.touches[0]
        }
        seekMouseDown = true;
        pBar = getP(e, seekBar);
        seekFillBar.style.width = pBar * 100 + '%';
        audio.removeEventListener('timeupdate', timeUpdate);
        document.querySelector('#seekHandle').classList.add('handle-hover')
    }
}

function mousetouchmove(e) {
    if (!seekMouseDown) return;
    if (currentlyPlaying) {
        if (seekMouseDown) {
            seekFillBar.style.transition = 'none';
            if (e.touches) {
                e = e.touches[0]
            }
            pBar = getP(e, seekBar);
            seekFillBar.style.width = pBar * 100 + '%';
            minutes = Math.floor((pBar * audio.duration) / 60);
            seconds = Math.floor((pBar * audio.duration) / 1);
            while (seconds >= 60) {
                seconds = seconds - 60;
            }
            if (seconds > -1 && seconds < 10) {
                seconds = ('0' + seconds).slice(-2);
            }
            document.querySelector('#songDurationTime').innerHTML = `${minutes}:${seconds}`
        }
    }
}

function mousetouchup(e) {
    seekFillBar.style.removeProperty('transition');
    if (!seekMouseDown) return;
    if (currentlyPlaying) {
        if (seekMouseDown) {
            if (e.changedTouches) {
                e = e.changedTouches[0]
            }
            seekMouseDown = false;
            pBar = getP(e, seekBar);
            seekFillBar.style.width = pBar * 100 + '%';
            audio.currentTime = pBar * audio.duration;
            let psong = allSongs[currentSong];
            let curDate = new Date();
            setActivity(psong.title, 'play', 'Playing', `by ${psong.artist}`, Math.round((curDate.getTime() / 1000) - audio.currentTime));
            audio.addEventListener('timeupdate', timeUpdate);
            document.querySelector('#seekHandle').classList.remove('handle-hover')
        }
    }
}

Vue.component('seekbar', {
    template: `<div id="seekWrapper" v-on:mouseover="hover" v-on:mousedown="down" v-on:mouseleave="leave" v-on:touchstart="down" v-on:touchoff="leave" class="seek-bar-inner-container"><div class="seek-bar"><div id="seekFill" class="fill"></div><div id="seekHandle" class="handle"></div></div></div>`,
    methods: {
        down(e) {
            mousetouchdown(e);
        },
        hover() {
            document.querySelector('#seekHandle').classList.add('handle-hover');
        },
        leave() {
            if (seekMouseDown) return;
            document.querySelector('#seekHandle').classList.remove('handle-hover')
        }
    }
});

window.addEventListener('mousemove', function (e) {
    mousetouchmove(e)
});

window.addEventListener('touchmove', function (e) {
    mousetouchmove(e)
});

window.addEventListener('mouseup', function (e) {
    mousetouchup(e);
});

window.addEventListener('touchend', function (e) {
    mousetouchup(e);
});

new Vue({
    el: '.seek-time-inner-container'
})

/* Tabs */
Vue.component('side-buttons', {
    props: ['button'],
    template: '<div class="item-sidebar" v-on:click="click"><div class="active-indicator"></div><i class="material-icons-outlined">{{ button.icon }}</i><span>{{ button.name }}</span></div>',
    methods: {
        click() {
            // everything here will be rewritten soon, i know it's awful
            /*
            if (tabClicked != 'songsTab' && tabClicked != 'settingsTab') {
                
            }
            if (tabClicked == 'playlistsTab') {
                
            }
            if (tabClicked == 'songsTab') {
                document.querySelector(`#songsTab`).style.display = 'flex';
                currentListViewing = 'Songs';
                listTitle.list.title = 'All Songs';
                listItems.songList = [];
                allSongs.forEach(f => {
                    listItems.songList.push(f);
                })
                updateListOrder('artist');
                document.querySelector('.songs-page').scroll(0,0);
            }
            if (tabClicked == 'settingsTab') {
                panelMsg.msg.icon = 'settings',
                panelMsg.msg.title = 'Settings Unavailable',
                panelMsg.msg.desc = 'Settings will return in a later update! Stay tuned...'
                document.querySelector('.panel-msg').style.display = 'flex';
                topButtons.button = [];
            }*/
            artists.artistList = [];
            //albums.albumList = [];
            playlists.playlistList = [];
            document.querySelector('.panel-msg').style.display = 'none';
            let tabClicked = this.$vnode.key;
            document.querySelector('.item-sidebar.active .active-indicator').style.display = 'none';
            document.querySelector('.item-sidebar.active').classList.remove('active')
            this.$el.classList.add('active');
            document.querySelector('.item-sidebar.active .active-indicator').style.display = 'block';
            document.querySelector('.track-list').style.display = 'none';
            let tabs = document.querySelectorAll('.pages');
            tabs.forEach(f => {
                f.style.display = 'none';
            });
            switch(tabClicked) {
                case "songsTab":
                    document.querySelector(`#songsTab`).style.display = 'flex';
                    currentListViewing = 'Songs';
                    listTitle.list.title = 'All Songs';
                    curPlayTabTitle = 'All Songs';
                    listItems.songList = [];
                    allSongs.forEach(f => {
                        listItems.songList.push(f);
                    })
                    updateListOrder('artist');
                    document.querySelector('.songs-page').scroll(0,0);
                    topButtons.button = [
                        {name: 'Nuke Library', id: 'nuke', for: null, icon: 'delete'},
                        {name: 'Add Songs', id: 'addFiles', for: 'addFiles', icon: 'add'}
                    ]
                    break;
                case "artistsTab":
                    document.querySelector('#artistsTab').scroll(0,0);
                    document.querySelector('.artist-spinner').style.display = 'block'
                    document.querySelector(`#artistsTab .artists-albums-container`).style.display = 'flex';
                    document.querySelector(`#artistsTab`).style.display = 'block';
                    setTimeout(() => {
                        artists.artistList = sortArray(artistListBack, 'artist');
                        topButtons.button = [];
                        document.querySelector('.artist-spinner').style.display = 'none'
                    }, 10);
                    break;
                case "albumsTab":
                    document.querySelector('#albumsTab').scroll(0,0);
                    document.querySelector('.album-spinner').style.display = 'block'
                    document.querySelector(`#albumsTab .artists-albums-container`).style.display = 'flex';
                    document.querySelector(`#albumsTab`).style.display = 'block';
                    setTimeout(() => {
                        albums.albumList = sortArray(albumListBack, 'album');
                        topButtons.button = [];
                        document.querySelector('.album-spinner').style.display = 'none'
                    }, 10)
                    break;
                case "playlistsTab":
                    document.querySelector('#playlistsTab').scroll(0,0);
                    document.querySelector('.playlist-spinner').style.display = 'block'
                    document.querySelector('#playlistsTab').style.display = 'block'
                    document.querySelector('.playlists-container').style.display = 'flex'
                    panelMsg.msg.icon = 'playlist_play',
                    panelMsg.msg.title = 'No Playlists Found',
                    panelMsg.msg.desc = 'Click Create Playlist to get started!'
                    playlists.playlistList = [];
                    setTimeout(() => {
                        fs.promises.readFile(`${app.getPath('userData')}/playlist.json`, (err) => {
                            if (err) {
                                console.error(err);
                                document.querySelector('.playlist-spinner').style.display = 'none'
                                document.querySelector('.panel-msg').style.display = 'flex';
                            }
                        }).then(file => {
                            try {
                                let getPlaylists = JSON.parse(file.toString());
                                if (Object.keys(getPlaylists).length == 0) {
                                    document.querySelector('.playlist-spinner').style.display = 'none'
                                    document.querySelector('.panel-msg').style.display = 'flex';
                                }
                                let plArray = [];
                                Object.keys(getPlaylists).forEach(f => {
                                    plArray.push(getPlaylists[f]);
                                })
                                document.querySelector('.playlist-spinner').style.display = 'none'
                                plArray = sortArray(plArray, 'name');
                                playlists.playlistList = plArray;
                            } catch(err) {
                                document.querySelector('.panel-msg').style.display = 'flex';
                            }
                        })
                        topButtons.button = [
                            {name: 'Create Playlist', id: 'createPlaylist', for: null, icon: 'playlist_add'}
                        ]
                    }, 10)
                    break;
                case "settingsTab":
                    panelMsg.msg.icon = 'settings',
                    panelMsg.msg.title = 'Settings Unavailable',
                    panelMsg.msg.desc = 'Settings will return in a later update! Stay tuned...'
                    document.querySelector('.panel-msg').style.display = 'flex';
                    topButtons.button = [];
                    break;
            }
        }
    },
    mounted() {
        if (this.$vnode.key == 'songsTab') {
            this.$el.classList.add('active');
            document.querySelector('.item-sidebar.active .active-indicator').style.display = 'block';
        }
    }
})

let sideButtons = new Vue({
    el: '.nav-buttons',
    data: {
        section1: [
            {'icon': 'music_note', 'name': 'Songs', 'id': 'songsTab'},
            {'icon': 'person', 'name': 'Artists', 'id': 'artistsTab'},
            {'icon': 'album', 'name': 'Albums', 'id': 'albumsTab'}
        ],
        section2: [
            {'icon': 'playlist_play', 'name': 'Playlists', 'id': 'playlistsTab'}
        ],
        section3: [
            {'icon': 'settings', 'name': 'Settings', 'id': 'settingsTab'}
        ]
    }
})

let listTitle = new Vue({
    el: '.tab-title-text',
    data: {
        list: {
            'title': 'All Songs',
            'count': '0 songs'
        }
    }
})

let npTitle = new Vue({
    el: '.top-controls span',
    data: {
        list: {
            'title': 'All Songs'
        }
    }
})

let tabTitle = document.querySelector('.tab-title');
let giveSpace = false;

document.querySelector('.songs-page').addEventListener('scroll', evt => {
    let scrollTop = evt.target.scrollTop;
    let scrollBy = 60;
    if (giveSpace) {
        scrollBy = 0;
    }
    if (scrollTop > scrollBy) {
        tabTitle.style.height = '40px';
        document.querySelector('.tab-title h2').style.fontSize = '20px';
        document.querySelector('.tab-title h2').style.paddingTop = '26px';
        document.querySelector('.tab-title-text div').style.opacity = 0;
        giveSpace = true;
    } else {
        tabTitle.style.height = '90px';
        document.querySelector('.tab-title h2').style.fontSize = '1.5em';
        document.querySelector('.tab-title h2').style.paddingTop = '0px';
        document.querySelector('.tab-title-text div').style.opacity = 0.8;
        giveSpace = false
    }
})

/* Add songs */
let songAddInfo = new Vue({
    el: '.add-songs-notify',
    data: {
        addInfo: 'Adding 0 songs to your library...',
        icon: 'autorenew'
    }
});

document.querySelector('#addFiles').addEventListener('change', (el) => {
    addSongs(el.target.files);
})

let fileWorker = new Worker('./ftmodules/files.js');
let progressTotal = 0;

let addSongs = async (files) => {
    document.querySelector('.add-songs-notify').style.display = 'flex'
    document.querySelector('.add-icon').classList.add('spin');
    songAddInfo.icon = 'autorenew';
    if (files.length == 1) {
        songAddInfo.addInfo = `Adding 1 song to your library...`
    } else {
        songAddInfo.addInfo = `Adding ${files.length} songs to your library...`
    }
    songAddInfo.num = files.length;
    progressTotal = files.length;
    fileWorker.postMessage([files, app.getPath('userData')]);
}

fileWorker.onmessage = async (metadata) => {
    if (metadata.data[1] == false) {
        document.querySelector('.notify-progbar').style.width = (metadata.data[0] / progressTotal) * 100 + '%';
        remote.getCurrentWindow().setProgressBar(metadata.data[0] / progressTotal);
        return;
    }
    setTimeout(() => {
        document.querySelector('.notify-progbar').style.width = '0%';
        message = metadata.data[0];
        document.querySelector('.add-icon').classList.remove('spin');
        songAddInfo.icon = 'check'
        if (message == undefined) message = 0;
        if (message == 1) {
            songAddInfo.addInfo = `Added 1 song to your library`
        } else {
            songAddInfo.addInfo = `Added ${message} songs to your library`
        }
        remote.getCurrentWindow().setProgressBar(0);
        list.postMessage({'userData': app.getPath('userData'), 'playlist': null});
        setTimeout(() => {
            document.querySelector('.add-songs-notify').style.display = 'none';
        }, 2000)
    }, 100)
}

/* Artists page */
let getArtist = artistClicked => {
    listItems.songList = [];
    allSongs.forEach(f => {
        if (f.artist == artistClicked) {
            listItems.songList.push(f);
        }
    });
    currentListViewing = `artist-${artistClicked}`;
    listTitle.list.title = artistClicked;
    curPlayTabTitle = artistClicked;
    document.querySelector('.artist-album-list').style.display = 'none';
    document.querySelector(`#songsTab`).style.display = 'flex';
    updateListOrder('album');
    document.querySelector('.songs-page').scroll(0,0);
}

let getAlbum = albumClicked => {
    listItems.songList = [];
    allSongs.forEach(f => {
        if (f.album == albumClicked) {
            listItems.songList.push(f);
        }
    });
    currentListViewing = `album-${albumClicked}`;
    listTitle.list.title = albumClicked;
    curPlayTabTitle = albumClicked;
    document.querySelector('.artist-album-list').style.display = 'none';
    document.querySelector('.albums-container').style.display = 'none';
    document.querySelector(`#songsTab`).style.display = 'flex';
    updateListOrder('title');
    document.querySelector('.songs-page').scroll(0,0);
}

let getSpecificPlaylist = (playlistClicked, songs) => {
    console.log(playlistClicked);
    listItems.songList = [];
    songs.forEach(f => {
        allSongs.forEach(a => {
            if (listItems.songList.indexOf(a) != -1) return;
            if (a.file == f) {
                console.log(listItems.songList.indexOf(a.file))
                listItems.songList.push(a);
            }
        })
    })
    currentListViewing = `playlist-${playlistClicked}`;
    listTitle.list.title = playlists.playlistList[playlistClicked].name;
    curPlayTabTitle = playlists.playlistList[playlistClicked].name;
    document.querySelector('.playlists-list').style.display = 'none';
    document.querySelector('.playlists-container').style.display = 'none';
    document.querySelector(`#songsTab`).style.display = 'flex';
    updateListOrder('title');
    document.querySelector('.songs-page').scroll(0,0);
}

Vue.component('artist-item', {
    props: ['artist'],
    template: '<div v-on:click="click" class="artist-item"><h3>{{ artist.artist }}</h3></div>',
    methods: {
        click() {
            getArtist(this.$vnode.key);
        }
    }
});

let artists = new Vue({
    el: '.artists-container',
    data: {
        artistList: []
    }
})

/* Albums page */
Vue.component('album-item', {
    props: ['album'],
    asyncComputed: {
        async bg() {
            let img;
            let getImg = new Promise(resolve => {
                fetch(`http://localhost:56743/${this.album.album.replace(/[.:<>"*?/{}()'|[\]\\]/g, "_").replace(/[ ]/g, "%20")}.jpg`).then(response => {
                    if (response.ok) {
                        img = `http://localhost:56743/${this.album.album.replace(/[.:<>"*?/{}()'|[\]\\]/g, "_").replace(/[ ]/g, "%20")}.jpg`;
                    } else {
                        img = '../assets/no_album.svg';
                    }
                    resolve();
                })
            });
            await getImg;
            return img;
        }
    },
    template: '<div v-on:click="click" class="album-item"><img loading="lazy" class="album-cover" @load="loaded" v-bind:src="bg"><div><p class="album-title">{{ album.album }}</p><p class="album-artist-name">{{ album.artist }}</p></div></div>',
    methods: {
        click() {
            getAlbum(this.$vnode.key);
        },
        loaded() {
            return this.$el.children[0].style.opacity = 1;
        }
    }
});

let albums = new Vue({
    el: '.albums-container',
    data: {
        albumList: []
    }
})

let playlistImageEl;

let edPl = new Worker('./ftmodules/editplaylist.js');

let panel = {
    open(wpanel) {
        document.onkeydown = null;
        switch(wpanel) {
            case "createPlaylist":
                ftpanel.title = 'Create Playlist';
                playlistCreateMenu = new createPlaylist({
                    methods: {
                        create() {
                            let img = "../assets/no_album.svg"
                            if (playlistImageEl != "") {
                                img = playlistImageEl;
                            }
                            createPlaylistWkr.postMessage([this.plName, app.getPath('userData'), img, this.plDesc]);
                        }
                    },
                    data: {
                        plName: 'My Playlist',
                        plDesc: ''
                    }
                });
                panel.mounted = playlistCreateMenu;
                playlistCreateMenu.$mount('.panel-content');
                playlistImageEl = '';
                break;
            case 'addPL':
                ftpanel.title = 'Add to Playlist'
                addPLex = new addPL({
                    data: {
                        plList: []
                    },
                    created() {
                        fs.promises.readFile(`${app.getPath('userData')}/playlist.json`, (err) => {
                            if (err) {
                                console.error(err);
                            }
                        }).then(file => {
                            let getPlaylists = JSON.parse(file.toString());
                            let plArray = [];
                            Object.keys(getPlaylists).forEach(f => {
                                plArray.push(getPlaylists[f]);
                            })
                            plArray = sortArray(plArray, 'name');
                            this.plList = plArray;
                        });
                    }
                })
                panel.mounted = addPLex;
                addPLex.$mount('.panel-content');
                break;
            case "editPL":
                ftpanel.title = 'Edit Playlist'
                let editPL = new editPlaylist({
                    data: {
                        plName: 'Playlist Title',
                        plDesc: 'Playlist Desc'
                    },
                    created() {
                        let plID = itemClicked;
                        fs.promises.readFile(`${app.getPath('userData')}/playlist.json`, (err) => {
                            if (err) {
                                console.error(err);
                            }
                        }).then(file => {
                            let pl = JSON.parse(file.toString());
                            let plItem = pl[plID];
                            console.log(plItem)
                            this.plName = plItem.name;
                            this.plDesc = plItem.desc;
                            if (plItem.image != '../assets/no_album.svg') {
                                document.querySelector('.playlist-create-img').style.backgroundImage = `url('http://localhost:56743/${plID}.png')`;
                            }
                        });
                    },
                    methods: {
                        edit() {
                            let plName = this.plName;
                            let plDesc = this.plDesc;
                            edPl.postMessage([playlistImageEl, itemClicked, app.getPath('userData'), plName, plDesc]);
                            edPl.onmessage = plD => {
                                console.log('jjjj')
                                let pl = plD.data;
                                panel.close();
                                if (Object.keys(pl).length == 0) {
                                    document.querySelector('.panel-msg').style.display = 'flex';
                                }
                                let plArray = [];
                                Object.keys(pl).forEach(f => {
                                    plArray.push(pl[f]);
                                })
                                plArray = sortArray(plArray, 'name');
                                playlists.playlistList = plArray;
                            }
                        }
                    }
                })
                panel.mounted = editPL;
                editPL.$mount('.panel-content');
                playlistImageEl = '';
                break;
            case "blm":
                ftpanel.title = '#BlackLivesMatter';
                let blmPanel = new blm();
                panel.mounted = blmPanel;
                blmPanel.$mount('.panel-content');
        }
        document.querySelector('.panel').classList.remove('hidden');
        document.querySelector('.panel').classList.add('open');
        document.querySelector('.panel-win').classList.remove('hidden');
    },
    close() {
        keyboardControl();
        document.querySelector('.panel').classList.remove('open');
        document.querySelector('.panel').classList.add('hidden');
        document.querySelector('.panel-win').classList.add('hidden');
        setTimeout(() => {
            panel.mounted.$destroy;
            document.querySelector('.panel-content').innerHTML = '';
        }, 200)
    },
    mounted: null
}

/* top bar button shit */

Vue.component('top-buttons', {
    props: ['button'],
    template: `<label class="top-button" v-bind:for="checkFor" v-on:click="click"><i class="material-icons-outlined">{{button.icon}}</i><span>{{button.name}}</span></label>`,
    computed: {
        checkFor(item) {
            if (item.button.for != null) {
                return item.button.for;
            }
        }
    },
    methods: {
        click() {
            switch(this.button.id) {
                case 'nuke':
                    fs.unlink(app.getPath('userData') + '/library.json', (err) => {
                        if (err) console.error(err);
                        list.postMessage({'userData': app.getPath('userData'), 'playlist': false});
                    });
                    break;
                case 'createPlaylist':
                    panel.open('createPlaylist');
                    break;
            }
        }
    }
});

let topButtons = new Vue({
    el: '.top-button-container',
    data: {
        button: [
            {name: 'Nuke Library', id: 'nuke', for: null, icon: 'delete'},
            {name: 'Add Songs', id: 'addFiles', for: 'addFiles', icon: 'add'}
        ]
    }
});

let ftpanel = new Vue({
    el: '.panel',
    data: {
        title: 'Panel Title'
    },
    methods: {
        closePanel() {
            panel.close();
        }
    }
})

let curPlaylist;
/* Playlists */
Vue.component('playlist-item', {
    props: ['playlist'],
    computed: {
        bg() {
            if (this.playlist.image == '../assets/no_album.svg') {
                return `background-image: url('${this.playlist.image}')`;
            } else {
                return `background-image: url('http://localhost:56743/${this.playlist.id}.png')`;
            }
        }
    },
    template: `<div v-on:contextmenu="ctxMenu" class="playlist-item"><div class="playlist-item-inner-container" v-on:click="click"><div class="playlist-image" v-bind:style="bg"></div><span class="playlist-name">{{ playlist.name }}</span></div></div>`,
    methods: {
        click() {
            curPlaylist = this.playlist.id;
            getSpecificPlaylist(playlists.playlistList.indexOf(this.playlist), this.playlist.files);

        },
        ctxMenu(e) {
            openCtx(e, 'playlist', this.$vnode.key)
        }
    }
});

let playlists = new Vue({
    el: '.playlists-container',
    data: {
        playlistList: []
    }
});

let createPlaylist = Vue.extend({
    template: 
    `<div class="panel-content">
        <div class="playlist-create-flex">
            <div>
                <label for="addPlaylistImage" class="playlist-image-label">Add image</label>
                <div class="playlist-create-img"></div>
            </div>
            <div>
                <div class="input-label">Title</div>
                <input type="text" v-model="plName" @input="$emit('input', $event.target.value)" placeholder="My Playlist">
                <div class="input-label">Description</div>
                <textarea class="long-text" v-model="plDesc" @input="$emit('textarea', $event.target.value)" placeholder="Write a lovely description about your playlist here..."></textarea>
            </div>
        </div>
        <div class="button-right">
            <div v-on:click="create" class="button"><span>Create</span></div>
        </div>
    </div>`
});

let editPlaylist = Vue.extend({
    template: 
    `<div class="panel-content">
        <div class="playlist-create-flex">
            <div>
                <label for="addPlaylistImage" class="playlist-image-label">Add image</label>
                <div class="playlist-create-img"></div>
            </div>
            <div>
                <div class="input-label">Title</div>
                <input type="text" v-model="plName" @input="$emit('input', $event.target.value)" placeholder="My Playlist">
                <div class="input-label">Description</div>
                <textarea class="long-text" v-model="plDesc" @input="$emit('textarea', $event.target.value)" placeholder="Write a lovely description about your playlist here..."></textarea>
            </div>
        </div>
        <div class="button-right">
            <div v-on:click="edit" class="button"><span>Edit</span></div>
        </div>
    </div>`
});

let blm = Vue.extend({
    template: 
    `<div class="panel-content">
        <div style="padding: 0 15px;">
            <p style="margin:0;">The death of George Floyd is unfortunately one example of many acts of police brutality towards black people. It's heartbreaking to see these disgusting acts of racism is still happening in 2020. 
            The lack of justice, equality and human rights for the black community is disgusting and must be changed.</p>
            <p>Although I don't have a real platform and my voice is miniscule, I hope this message will reach someone in this world. I stand with George Floyd and the black community.</p>
            <p>projsh_</p>
        </div>
    </div>`
});

document.querySelector('.blm').onclick = () => {
    panel.open('blm')
}

document.querySelector('#addPlaylistImage').addEventListener('change', (el) => {
    let reader = new FileReader();
    reader.onload = function() {
        playlistImageEl = Buffer.from(this.result, 'hex');
        document.querySelector('.playlist-create-img').style.backgroundImage = `url('${el.target.files[0].path.replace(/[\\]/g, "/")}')`;
    }
    reader.readAsArrayBuffer(el.target.files[0]);
})

let createPlaylistWkr = new Worker('./ftmodules/createplaylist.js');

createPlaylistWkr.onmessage = () => {
    document.querySelector('.panel-msg').style.display = 'none';
    fs.promises.readFile(`${app.getPath('userData')}/playlist.json`, (err) => {
        if (err) {
            console.error(err);
            document.querySelector('.panel-msg').style.display = 'flex';
        }
    }).then(file => {
        try {
            let getPlaylists = JSON.parse(file.toString());
            if (Object.keys(getPlaylists).length == 0) {
                document.querySelector('.panel-msg').style.display = 'flex';
            }
            let plArray = [];
            Object.keys(getPlaylists).forEach(f => {
                plArray.push(getPlaylists[f]);
            })
            plArray = sortArray(plArray, 'name');
            playlists.playlistList = plArray;
        } catch(err) {
            document.querySelector('.panel-msg').style.display = 'flex';
        }
    });
    panel.close();
}

/* Context menu */
Vue.component('ctx-item', {
    props: ['list'],
    template: '<div class="context-item" v-on:click="click">{{ list.name }}</div>',
    methods: {
        click() {
            switch(this.list.id) {
                case "addPlaylist":
                    panel.open('addPL');
                    break;
                case "removePlaylist":
                    document.querySelector('.panel-msg').style.display = 'none';
                    fs.promises.readFile(`${app.getPath('userData')}/playlist.json`, (err) => {
                        if (err) {
                            console.error(err);
                        }
                    }).then(file => {
                        let getPlaylists = JSON.parse(file.toString());
                        if (getPlaylists[itemClicked] != '../assets/no_album.svg') {
                            fs.unlinkSync(getPlaylists[itemClicked].image);
                        }
                        delete getPlaylists[itemClicked];
                        let formattedMetadata = JSON.stringify(getPlaylists);
                        fs.writeFile(`${app.getPath('userData')}/playlist.json`, formattedMetadata, err => {
                            if (err) console.error(err);
                            postMessage(true);
                        });
                        if (Object.keys(getPlaylists).length == 0) {
                            document.querySelector('.panel-msg').style.display = 'flex';
                        }
                        let plArray = [];
                        Object.keys(getPlaylists).forEach(f => {
                            plArray.push(getPlaylists[f]);
                        })
                        plArray = sortArray(plArray, 'name');
                        playlists.playlistList = plArray;
                    });
                    break;
                case "editPlaylist":
                    panel.open('editPL');
                    break;
                case "rmSongPlaylist":
                    fs.promises.readFile(`${app.getPath('userData')}/playlist.json`, (err) => {
                        if (err) {
                            console.error(err);
                        }
                    }).then(file => {
                        file = JSON.parse(file.toString());
                        let testCurFiles = [];
                        listItems.songList.forEach((f, i) => {
                            if (highlightedSongs.indexOf(i) == -1) {
                                testCurFiles.push(f.file);
                            }
                        });
                        console.log(file[curPlaylist]);
                        file[curPlaylist].files = testCurFiles;
                        let playlistIndex = playlists.playlistList.indexOf(file[curPlaylist]);
                        console.log(playlistIndex)
                        playlists.playlistList[playlistIndex].files = testCurFiles;
                        let formattedMetadata = JSON.stringify(file);
                        fs.writeFile(`${app.getPath('userData')}/playlist.json`, formattedMetadata, err => {
                            if (err) console.error(err);
                            getSpecificPlaylist(playlistIndex, testCurFiles);
                        });
                    })
            }
        }
    }
});

ctxListSong = [
    {name: 'Add to playlist', id: 'addPlaylist'},
    {name: 'Remove from library', id: 'removeFromLibrary'}
]

ctxListPlaylist = [
    {name: 'Edit Playlist', id: 'editPlaylist'},
    {name: 'Remove Playlist', id: 'removePlaylist'}
]

ctxPlaylistItems = [
    {name: 'Remove from playlist', id: 'rmSongPlaylist'},
    {name: 'Remove from library', id: 'removeFromLibrary'}
]

let ctxItems = new Vue({
    el: '.context-list',
    data: {
        ctxList: ctxListSong
    }
})

let addPL = Vue.extend({
    template:
    `<div class="panel-content">
        <pl-list v-for="item in plList" v-bind:playlist="item" v-bind:key="item.id"></pl-list>
    </div>`
})

Vue.component('pl-list', {
    props: ['playlist'],
    computed: {
        bg() {
            if (this.playlist.image == '../assets/no_album.svg') {
                return `background-image: url('${this.playlist.image}')`;
            } else {
                return `background-image: url('http://localhost:56743/${this.playlist.id}.png')`;
            }
        }
    },
    template:
    `<div v-on:click="add" class="addPl-item">
        <div class="addPl-img" v-bind:style="bg">
        </div>
        <span>{{playlist.name}}</span>
    </div>`,
    methods: {
        add() {
            let filesToAdd = [];
            highlightedSongs.forEach(f => {
                filesToAdd.push(listItems.songList[f].file);
            });
            console.log(filesToAdd);
            addPlaylist.postMessage([filesToAdd, this.playlist.id, app.getPath('userData')])
        }
    }
});

addPlaylist.onmessage = () => {
    panel.close();
}

let panelMsg = new Vue({
    el: '.panel-msg',
    data: {
        msg: {
            icon: 'playlist_play',
            title: 'No Playlists Found',
            desc: 'Click Create Playlist to get started!'
        }
    }
})

let customLog = (msg, style) => {
    return console.log(`%c${msg}`, `font-family: ${style}`);
}

let detach = false;

win.on('devtools-opened', () => {
    if (!detach) {
        win.closeDevTools();
        detach = true;
        win.openDevTools({mode: 'detach'});
        return;
    }
    detach = false;
    customLog('Hold up!', 'color: #df5a25; font-size: 72px; font-weight: bold; -webkit-text-stroke: 2px black');
    customLog("Pasting anything in here could potentially harm your computer.", "font-size: 22px; color: red; font-weight: bold");
    customLog("Unless you absolutely understand what you're doing, you should close this window.", "font-size: 16px");
    customLog("If you do understand what you're doing, you may want to hide those network errors! They're usually not important and clog up the console. Click the little cog icon and disable 'Hide network'.", "font-size: 16px");
})

/* mobile-like ui shit */
new Vue({
    el: '.show-np i',
    methods: {
        click() {
            document.querySelector('.playing-bar-hidden').classList.add('visible');
            document.querySelector('.playing-bar').classList.add('visible');
            document.querySelector('.playing-bar-inner-container').classList.add('visible');
        }
    }
});

new Vue({
    el: '.hide-np i',
    methods: {
        click() {
            document.querySelector('.playing-bar-hidden').classList.remove('visible');
            document.querySelector('.playing-bar').classList.remove('visible');
            document.querySelector('.playing-bar-inner-container').classList.remove('visible');
        }
    }
});