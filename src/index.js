const {remote, clipboard, ipcRenderer} = require('electron')
const fs = require("fs")
const path = require('path')
const hljs = require('highlight.js')
const DataStore = require('./script/store')
const dataStore = new DataStore()
const Tab = require('./script/tab')
const Toast = require('./script/toast')
const util = require('./script/util')
const relativePath = require('./script/util').relativePath
const htmlTel = require('./script/htmlFileTel')
const marked = require('markdown-it')({
                                          html: true,
                                          xhtmlOut: true,
                                          // linkify: true,
                                          typographer: true,
                                          highlight: function (str, lang) {
                                              if (lang && hljs.getLanguage(lang)) {
                                                  try {
                                                      return '<pre><code class="hljs">' +
                                                             hljs.highlight(lang, str, true).value +
                                                             '</code></pre>';
                                                  } catch (__) {
                                                  }
                                              }
                                              return '<pre><code class="hljs">'
                                                     + marked.utils.escapeHtml(str)
                                                     + '</code></pre>';
                                          },
                                      })
    .use(require('markdown-it-emoji'))
    .use(require('markdown-it-footnote'))
    .use(require('markdown-it-sup'))
    .use(require('markdown-it-abbr'))
    .use(require('markdown-it-deflist'))
    .use(require('markdown-it-ins'))
    .use(require('markdown-it-mark'))
    .use(require('markdown-it-sub'))
    .use(require('markdown-it-imsize')) //![](1.png =10x10)
    .use(require('@hikerpig/markdown-it-toc-and-anchor').default, {
        tocPattern: /^\[toc\]/im,
        anchorLink: false
    }) // [TOC]
    .use(require('markdown-it-attrs')) //![](1.png){style=width:200px;height:100px}
    .use(require('markdown-it-task-lists')) //- [x] or - [ ]
    .use(require('markdown-it-texmath').use(require('katex'))) // $???$$
    .use(require('markdown-it-plantuml')) //https://plantuml.com/
//HTML???markdown
const html2md = require('html-to-md')

const tempPath = remote.getGlobal('sharedObject').temp

let scrollSync = dataStore.getScrollSync()

let tabs = new Map() //???????????????
let tab //???????????????

let myTabs = $('#myTab')
let myTabsContent = $('#myTabContent')
//????????????????????????
let num = 0

//??????????????????????????????????????????
cutCodeStyle(dataStore.getCodeStyle())
cutHTMLStyle(dataStore.getHTMLStyle())
cutEditorStyle(dataStore.getEditorStyle())
cutNightMode(dataStore.getNightMode())
cutPreviewMode(dataStore.getCutPreview())

//??????close???????????????
function closeDisplay() {
    if (tabs.size === 0) {
        return
    }
    const element = tabs.values().next().value.getClose()
    if (tabs.size > 1) {
        element.style.display = 'block'
    } else {
        element.style.display = 'none'
    }
}

//???????????????
function cutTab(k) {
    tab = tabs.get(k + '')
    tab.getPage().className = 'tab-pane fade in active'
    tab.getCodeMirror().refresh() //??????CSS????????????????????????
}

//???????????????Tab??????
function getTab(k) {
    return tabs.get(k + '')
}

//???????????????
function putTab(k, v) {
    tabs.set(k + '', v)
    closeDisplay()
}

//???????????????
function deleteTab(k) {
    //??????DOM
    $('#' + tabs.get(k + '').getLiId()).remove();
    $('#' + tabs.get(k + '').getPageId()).remove();
    //????????????
    tabs.delete(k + '')
    closeDisplay()
    //???????????????????????????????????????
    if (tab && tab.getId() !== (k + '')) {

    } else {
        tab = tabs.values().next().value
        tab.getHeader().click()
    }
}

//???????????????????????????????????????
function insertPictureToTextarea(tab, src) {
    insertTextareaValue(tab, '![](' + src + ')')
}

//win????????????
function pathSep(src) {
    if (path.sep === '\\') {
        src = src.replace(/\\/g, "/")
    }
    return src
}

//???????????????????????????????????????
function insertTextareaValue(tab1, txt) {
    let myCodeMirror = tab1.getCodeMirror()
    myCodeMirror.doc.replaceSelection(txt)
    changeMarkedHTMLValue(tab1, myCodeMirror.doc.getValue())
}

//??????????????????????????????????????????
function insertTextareaValueTwo(tab1, left, right) {
    let myCodeMirror = tab1.getCodeMirror()
    let selection = myCodeMirror.doc.getSelection()
    myCodeMirror.doc.replaceSelection(left + selection + right, 'around')
    changeMarkedHTMLValue(tab1, myCodeMirror.doc.getValue())
}

//????????????????????????
function changeTextareaValue(tab1, txt) {
    const scrollInfo = tab1.getCodeMirror().getScrollInfo()
    let cursor = tab1.getCodeMirror().doc.getCursor()
    tab1.getCodeMirror().doc.setValue(txt)
    changeMarkedHTMLValue(tab1, txt)
    tab1.getCodeMirror().doc.setCursor(cursor)
    tab1.getCodeMirror().scrollTo(scrollInfo.left, scrollInfo.top)
    //?????????????????????
    tab1.getCodeMirror().refresh()
}

// md?????????html
function changeMarkedHTMLValue(tab1, txt) {
    //?????????????????????????????????????????????win????????????
    let ntxt = txt
    util.readImgLink(txt, (src) => {
        ntxt = ntxt.replace(src, pathSep(relativePath(tab1.getDirname(), src)))
    })
    tab1.getMarked().innerHTML = marked.render(ntxt) // {baseUrl: tab1.getPath()}
    //???????????????????????????
    tab1.isEditChangeIco(txt)
    //??????????????????
    remote.getGlobal('sharedObject').closeAllWindow = tab1.isEdit()
    //TOC????????????*
    const elements = document.getElementsByClassName('markdownIt-TOC')
    for (const element of elements) {
        element.innerHTML = element.innerHTML.replace(/\n\*\n/g, '\n')
    }
}

//?????????????????????
function createNewTab(...dataAndPath) {
    let text = dataAndPath[0] || ''
    let filePath = dataAndPath[1] || '?????????' + (num === 0 ? '' : num + 1)
    let tab1 = new Tab(num, text, filePath, document);

    // ?????????????????????
    if (dataAndPath[1]){
        dataStore.addRecentlyOpenedList(filePath)
    }

    myTabs.append(`
<li id="${tab1.getLiId()}">
    <a href="#${tab1.getPageId()}" id="${tab1.getHeaderId()}" data-id="${tab1.getId()}"
       data-toggle="tab" class="header" draggable="false"></a>
    <i class="glyphicon glyphicon-remove close" id="${tab1.getCloseId()}" 
    data-id="${tab1.getId()}"></i>
</li>
`)

    myTabsContent.append(`
<div class="tab-pane fade" id="${tab1.getPageId()}">
<div class="container page-header">
   <div class="row" >
      <div id="${tab1.getLeftId()}" class="col-xs-6 col-sm-6 col" style="border-right: 1px solid #f5f5f5;">
          <textarea id="${tab1.getTextareaId()}" data-id="${tab1.getId()}" autocapitalize="none" 
          autocomplete="off" autofocus spellcheck="false" class="form-control editor"></textarea>
       </div>
      <div id="${tab1.getRightId()}" class="col-xs-6 col-sm-6 col">
         <div id="${tab1.getMarkedId()}" data-id="${tab1.getId()}" class="md2html"></div>
      </div>
   </div>
</div>
    </div>
`)
    //??????????????????
    putTab(tab1.getId(), tab1)
    //?????????
    num++;
    //?????????????????????
    tab = tab1;

    //????????????
    if (tab1.getPath() && tab1.getPath().length > 0) {
        tab1.getHeader().innerHTML = path.basename(tab1.getPath())
    }
    //???????????????
    let myCodeMirror = CodeMirror.fromTextArea(tab1.getTextarea(), {
        lineNumbers: true,
        value: '',
        theme: dataStore.getEditorStyle(),
        mode: 'markdown',
        dragDrop: false,
        lineWrapping: true,
        autofocus: true,
        cursorHeight: 0.8,
        matchBrackets: true,
        indentUnit: 4
    })
    tab1.setCodeMirror(myCodeMirror)
    //??????????????????
    if (text && text.length > 0) {
        changeTextareaValue(tab1, text)
    }

    //???????????????????????????
    let v = text;
    myCodeMirror.on('change', (codeMirror, object) => {
        //????????????MD
        if (v !== codeMirror.doc.getValue()) {
            changeMarkedHTMLValue(tab1, codeMirror.doc.getValue())
            v = codeMirror.doc.getValue();
        }
    })
    //????????????????????????
    myCodeMirror.setOption("extraKeys", {
        Tab: function (cm) {
            const spaces = Array(cm.getOption("indentUnit") + 1).join(" ");
            cm.replaceSelection(spaces);
        }
    })
    //??????????????????
    myCodeMirror.on('paste', (codeMirror, event) => {
        event.preventDefault()
    })

    //??????????????????????????????
    //???????????????
    myCodeMirror.on("scroll", () => {
        if (!scrollSync) {
            return
        }
        const scrollInfo = myCodeMirror.getScrollInfo()
        const height = scrollInfo.height - scrollInfo.clientHeight
        const proportion = scrollInfo.top / height
        const markedHeight = tab1.getMarked().scrollHeight - tab1.getMarked().clientHeight
        tab1.getMarked().scrollTop = markedHeight * proportion;
    })

    //?????????????????????????????????
    tab1.getHeader().click()

    //??????????????????
    editorFontSizeAdjust()
    //?????????????????????
    disPlayLineNumber(dataStore.getDisplayLineNumber())
    //????????????
    changeEditorFontFamily(dataStore.getEditorFontFamily())
    //?????????????????????
    myCodeMirror.focus()
}

//??????????????????
createNewTab()

//????????????,??????????????????
myTabs.get(0).addEventListener('click', function (event) {
    // event.preventDefault()
    const {dataset, classList} = event.target
    const id = dataset && dataset.id
    //????????????
    if (id && classList.contains('header')) {
        cutTab(id)
    }
    //????????????
    if (id && classList.contains('close') && tabs.size !== 1) {
        if (getTab(id).isEdit()) {
            //????????????????????????
            ipcRenderer.send('or-save-md-file', id)
        } else {
            deleteTab(id)
        }
    }
})

//??????????????????a?????????????????????
myTabsContent.get(0).addEventListener('click', function (event) {
    if (event.target.tagName === 'A' && !$(event.target).attr('href').startsWith('#')) {
        event.preventDefault()
    }
})

//????????????????????????????????????
ipcRenderer.on('or-save-md-file-result', (event, result, id) => {
    if (!result) {
        deleteTab(id)
    }
})

//????????????
ipcRenderer.on('new-tab', (() => {
    createNewTab()
}))

//??????????????????
ipcRenderer.on('look-md-example', (event, args) => {
    //?????????????????????????????????
    if (tab.getTextareaValue() && tab.getTextareaValue().length > 0) {
        createNewTab(args)
    } else { //?????????
        const tabId = tab.getId()
        createNewTab(args)
        deleteTab(tabId)
    }
})

function openMdFiles(files) {
    for (let i = 0; i < files.length; i++) {
        fs.readFile(files[i], function (err, data) {
            if (err) {
                return console.error(err);
            }
            //?????????????????????????????????
            if (tab.getTextareaValue() && tab.getTextareaValue().length > 0) {
                createNewTab(data.toString(), files[i])
            } else { //?????????
                const tabId = tab.getId()
                createNewTab(data.toString(), files[i])
                deleteTab(tabId)
            }
        });
    }
}

//????????????
ipcRenderer.on('open-md-file', (event, files) => {
    openMdFiles(files)
})

//????????????????????????
function saveFile(id) {
    let tab1 = getTab(id)
    //?????????????????????
    if (tab1.hasPath()) {
        //????????????
        fs.writeFile(tab1.getPath(), tab1.getTextareaValue(), function (err) {
            if (err) {
                return console.error(err);
            }
        });
        //?????????????????????
        tab1.setText(tab1.getTextareaValue())
        changeMarkedHTMLValue(tab1, tab1.getTextareaValue())
    } else {
        //????????????????????????(????????????????????????)
        let s = (tab1.getTextareaValue() + '\n').split('\n')[0].trim()
        ipcRenderer.send('new-md-file', id, util.stringDeal(s))
    }
}

//????????????
ipcRenderer.on('save-md-file', () => {
    saveFile(tab.getId())
})

//??????????????????????????????
ipcRenderer.on('new-md-file-complete', (event, filePath, id) => {
    let tab1 = getTab(id)
    //?????????????????????
    fs.writeFile(filePath, tab1.getTextareaValue(), function (err) {
        if (err) {
            return console.error(err)
        }
    });
    //????????????????????????????????????????????????
    let tab2 = tab1
    createNewTab(tab1.getTextareaValue(), filePath)
    deleteTab(tab2.getId())
})

//???????????????
ipcRenderer.on('rename-md-file', (event) => {
    remote.dialog.showSaveDialog({
                                     title: '?????????',
                                     defaultPath: tab.getTitle(),
                                     filters: [
                                         {name: 'markdown', extensions: ['md']}
                                     ]
                                 })
        .then(file => {
            if (!file.canceled) { //????????????????????????
                const filePath = file.filePath
                if (tab.hasPath()) { //???????????????
                    if (tab.isEdit()) {
                        saveFile(tab.getId())
                    }
                    fs.rename(tab.getPath(), filePath, function (err) {
                        if (err) {
                            return console.error(err)
                        }
                        //????????????????????????????????????????????????
                        let tab1 = tab
                        createNewTab(tab.getTextareaValue(), filePath)
                        deleteTab(tab1.getId())
                    })
                } else { //??????????????????????????????
                    tab.setPath(filePath)
                }
            }
        })
        .catch(err => {
            console.log(err)
        })
})

//?????????MD
ipcRenderer.on('copy-to-md', event => {
    clipboard.writeText(tab.getTextareaValue())
})

//??????HTML-Style????????????
function copyHtmlStyle() {
    let range = document.createRange();
    range.selectNodeContents(tab.getMarked());
    let selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    let result = document.execCommand("copy")
    if (!result) {
        console.log('copy fail')
    }
    selection.removeAllRanges()
}

//?????????HTML-Style
ipcRenderer.on('copy-to-html-style', event => {
    copyHtmlStyle()
})
//?????????HTML
ipcRenderer.on('copy-to-html', event => {
    clipboard.writeText(tab.getMarked().innerHTML)
})

function cutCodeStyle(name) {
    document.getElementById('code-style').href =
        '../node_modules/highlight.js/styles/' + name + '.css'
}

//??????Code-CSS??????
ipcRenderer.on('cut-code-style', (event, name) => {
    cutCodeStyle(name)
})

function cutHTMLStyle(name) {
    document.getElementById('html-style').href = './css/' + name + '.css'
}

//??????HTML-CSS??????
ipcRenderer.on('cut-html-style', (event, name) => {
    cutHTMLStyle(name)
})

function cutEditorStyle(name) {
    document.getElementById('editor-style').href =
        '../node_modules/codemirror/theme/' + name + '.css'
    if (tab && tab.getCodeMirror()) {
        tab.getCodeMirror().setOption('theme', name)
    }
}

//???????????????????????????
ipcRenderer.on('cut-editor-style', (event, args) => {
    cutEditorStyle(args)
})

//???????????????
myTabs.get(0).onwheel = function (event) {
    //??????????????????????????????????????????????????????????????????"???????????????????????????"?????????
    event.preventDefault();
    //?????????????????????????????????????????????????????????
    let step = 50;
    if (event.deltaY < 0) {
        //????????????????????????????????????????????????
        this.scrollLeft -= step;
    } else {
        //????????????????????????????????????????????????
        this.scrollLeft += step;
    }
}

//==========================??????????????????===========

//??????????????????
ipcRenderer.on('insert-picture-file', (event, filePaths) => {
    for (let i = 0; i < filePaths.length; i++) {
        insertPictureToTextarea(tab, filePaths[i])
    }
})

/*
 * ????????????
 */
document.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    for (const f of e.dataTransfer.files) {
        // ????????????MD??????
        if (path.extname(f.path).toLocaleLowerCase() === '.md') {
            openMdFiles(Array.of(f.path))
        }// ???????????????????????????
        else if (util.isLocalPicture(f.path)) {
            insertPictureToTextarea(tab, f.path)
        }
    }
});
document.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
});

/*
 * ????????????\HTML
 */
document.addEventListener('paste', function (event) {
    const items = event.clipboardData && event.clipboardData.items;
    if (!items || items.length < 1) {
        return
    }
    const types = {
        image: 'image',
        rtf: 'rtf',
        html: 'html',
        text: 'text'
    }
    let type
    for (let x of items) {
        if (x.type.indexOf(types.image) !== -1) {
            type = types.image
        } else if (x.type.indexOf(types.rtf) !== -1) {
            type = types.rtf
        } else if (x.type.indexOf(types.html) !== -1) {
            type = types.html
        } else if (x.type.indexOf(types.text) !== -1) {
            type = types.text
        }
    }
    // console.log(type)
    if (type === types.image) {
        // ????????????
        // file = items[i].getAsFile();
        const image = clipboard.readImage()
        const buffer = image.toPNG();
        let filePath
        if (tab.hasPath()) {
            filePath = tab.getPictureDir() + Math.floor(Math.random() * 10000000) + '.png'
        } else {
            filePath = tempPath + Math.floor(Math.random() * 10000000) + '.png'
        }
        fs.writeFile(filePath, buffer, (err) => {
            if (err) {
                return console.error(err);
            }
            if (filePath.startsWith(tab.getPictureDir())){
                filePath = filePath.replace(tab.getPictureDir(),`./${path.basename(tab.getPictureDir())}/`)
            }
            insertPictureToTextarea(tab, filePath)
        })
    } else if (type === types.rtf) {
        // ???????????????(???text)
        insertTextareaValue(tab, clipboard.readText())
    } else if (type === types.html) {
        // ??????HTML
        const html = clipboard.readHTML()
        insertTextareaValue(tab, html2md(html, {
            emptyTags: ['meta']
        }).trim())
    } else if (type === types.text) {
        // ???????????????
        insertTextareaValue(tab, clipboard.readText())
    }
})

//=================???????????????================

ipcRenderer.on('quick-key-insert-txt', (event, args) => {
    switch (args) {
        case 'CmdOrCtrl+Y':
            tab.getCodeMirror().execCommand('redo')
            break
        case 'CmdOrCtrl+1':
            tab.getCodeMirror().execCommand('goLineStart')
            insertTextareaValue(tab, '# ')
            break
        case 'CmdOrCtrl+2':
            tab.getCodeMirror().execCommand('goLineStart')
            insertTextareaValue(tab, '## ')
            break
        case 'CmdOrCtrl+3':
            tab.getCodeMirror().execCommand('goLineStart')
            insertTextareaValue(tab, '### ')
            break
        case 'CmdOrCtrl+4':
            tab.getCodeMirror().execCommand('goLineStart')
            insertTextareaValue(tab, '#### ')
            break
        case 'CmdOrCtrl+5':
            tab.getCodeMirror().execCommand('goLineStart')
            insertTextareaValue(tab, '##### ')
            break
        case 'CmdOrCtrl+6':
            tab.getCodeMirror().execCommand('goLineStart')
            insertTextareaValue(tab, '######')
            break
        case 'Alt+Command+T' || 'Ctrl+Shift+T':
            //???????????????????????????????????????
            showTableModal()
            break
        case 'Alt+Command+C' || 'Ctrl+Shift+C':
            insertTextareaValueTwo(tab, '```\n', '\n```')
            break
        case 'CmdOrCtrl+P':
            insertTextareaValue(tab, '![]()')
            break
        case 'Alt+Command+Q' || 'Ctrl+Shift+Q':
            tab.getCodeMirror().execCommand('goLineStart')
            insertTextareaValue(tab, '> ')
            break
        case 'Alt+Command+O' || 'Ctrl+Shift+O':
            tab.getCodeMirror().execCommand('goLineStart')
            insertTextareaValue(tab, '1. ')
            break
        case 'Alt+Command+U' || 'Ctrl+Shift+U':
            tab.getCodeMirror().execCommand('goLineStart')
            insertTextareaValue(tab, '- ')
            break
        case 'Alt+Command+X' || 'Ctrl+Shift+X':
            tab.getCodeMirror().execCommand('goLineStart')
            insertTextareaValue(tab, '- [x] ')
            break
        case 'Alt+Command+-' || 'Ctrl+Shift+-':
            insertTextareaValue(tab, '---')
            break
        case 'CmdOrCtrl+B':
            insertTextareaValueTwo(tab, '**', '**')
            break
        case 'CmdOrCtrl+I':
            insertTextareaValueTwo(tab, '*', '*')
            break
        case 'CmdOrCtrl+0':
            insertTextareaValueTwo(tab, '<u>', '</u>')
            break
        case 'Ctrl+`':
            insertTextareaValueTwo(tab, '`', '`')
            break
        case 'Shift+Ctrl+`':
            insertTextareaValueTwo(tab, '~~', '~~')
            break
        case 'Ctrl+-':
            insertTextareaValueTwo(tab, '<!--', '-->')
            break
        case 'CmdOrCtrl+K':
            insertTextareaValue(tab, '[]()')
            break
    }
})

//????????????????????????
function showTableModal() {
    $('body').append(`
<div class="modal fade in" id="myModal" tabindex="-1" role="dialog" aria-labelledby="myModalLabel"
     aria-hidden="true" style="display: block;">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <button type="button" class="close" data-dismiss="modal" aria-hidden="true"> ??
                </button>
                <h4 class="modal-title" id="myModalLabel"> ???????????? </h4></div>
            <div class="modal-body"> 
 <div class="container">
   <div class="row" >
      <div class="col-xs-6 col-sm-3">
  <div class="input-group">
   <span class="input-group-addon">???</span>
   <input type="text" id='table-row' class="form-control" placeholder="">
  </div>
    </div>
    <div class="col-xs-6 col-sm-3">
   <div class="input-group">
   <span class="input-group-addon">???</span>
   <input type="text" id="table-col" class="form-control" placeholder="">
  </div>
 </div>
 </div>
 </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-default" onclick="dismissTable()" data-dismiss="modal">??????</button>
                <button type="button" class="btn btn-primary" onclick="readTableInfo()" >??????</button>
            </div>
        </div><!-- /.modal-content --> 
    </div><!-- /.modal --> 
</div>
`)
}

function readTableInfo() {
    // ?????????????????????
    const row = document.getElementById('table-row').value
    const col = document.getElementById('table-col').value
    //??????MD??????
    insertTextareaValue(tab, util.createTableMD(row, col))
    dismissTable()
}

function dismissTable() {
    // ???????????????
    const self = document.getElementById('myModal')
    // ???????????????
    const parent = self.parentElement
    // ??????
    const removed = parent.removeChild(self)
}

function cutNightMode(args) {
    if (args) {
        document.getElementById('night-mode').setAttribute('href', './css/mode/nightMode.css')
    } else {
        document.getElementById('night-mode').setAttribute('href', './css/mode/null.css')
    }
}

// ??????????????????
ipcRenderer.on('cut-night-mode', (event, args) => {
    cutNightMode(args)
})

function refresh() {
    if (tab && tab.getCodeMirror()) {
        tab.getCodeMirror().refresh()
    }
}

function cutPreviewMode(args) {
    if (args) {
        document.getElementById('preview-mode').setAttribute('href', './css/mode/null.css')
    } else {
        document.getElementById('preview-mode').setAttribute('href', './css/mode/PreviewMode.css')
    }
    setTimeout(() => {
        refresh()
    }, 100)
}

// ??????????????????
ipcRenderer.on('cut-preview-mode', (event, args) => {
    cutPreviewMode(args)
})

// ??????????????????
ipcRenderer.on('cut-scroll-sync', (event, args) => {
    scrollSync = args
})

// ??????????????????
function editorFontSizeAdjust(target) {
    let oldSize = document.getElementById(tab.getLeftId())
                      .getElementsByClassName('CodeMirror')[0].style['font-size']
                  || dataStore.getEditorFontSize()
    let newSize = parseInt(oldSize)
    switch (target) {
        case '+':
            newSize < 30 ? newSize++ : ''
            break
        case '-':
            newSize > 10 ? newSize-- : ''
            break
    }
    newSize += 'px'
    //???????????????????????????
    for (let t of tabs.values()) {
        document.getElementById(t.getLeftId())
            .getElementsByClassName('CodeMirror')[0].style['font-size'] = newSize
        t.getCodeMirror().refresh() //??????CSS????????????????????????
    }
    dataStore.setEditorFontSize(newSize)
    if (target) {
        Toast.toast(newSize, 'success', 1000)
    }
}

ipcRenderer.on('editor-font-size-adjust', (event, args) => {
    editorFontSizeAdjust(args)
})

// ??????/????????????
function disPlayLineNumber(args) {
    if (args) {
        document.getElementById('editorPadding').innerHTML =
            `.CodeMirror{padding-left: 0 !important}`
    } else {
        document.getElementById('editorPadding').innerHTML =
            `.CodeMirror{padding-left: 1em !important}`
    }
    for (let t of tabs.values()) {
        t.getCodeMirror().setOption('lineNumbers', args)
        t.getCodeMirror().refresh() //??????CSS????????????????????????
    }
}

ipcRenderer.on('display-line-number', (event, args) => {
    disPlayLineNumber(args)
})

// ????????????
ipcRenderer.on('text-word-count', event => {
    let result = util.stringLength(tab.getCodeMirror().doc.getValue())
    let words = util.findStringWords(tab.getCodeMirror().doc.getValue())
    remote.dialog.showMessageBox({
                                     message: `
                                     ?????????${result.chinese}
                                     ?????????${result.english}
                                     ?????????${result.number}
                                     ?????????${result.other}
                                     ???????????????${words}`
                                 }).then()
})

// ????????????
function changeEditorFontFamily(args) {
    document.getElementById('editorFontFamily').innerHTML =
        `.md2html,.CodeMirror{font-family:${args}, sans-serif !important}`
}

ipcRenderer.on('editor-font-family-adjust', (event, args) => {
    changeEditorFontFamily(args)
})

// ???????????????
ipcRenderer.on('format-md-code', event => {
    let oldText = tab.getCodeMirror().doc.getSelection()
    let newText = ''
    let objReadline = oldText.split('\n')
    let snum = 0
    for (let i = 0; i < objReadline.length; i++) {
        let line = objReadline[i]
        if (i === 0) {
            for (let j = 0; j < line.length; j++) {
                if (line.charAt(j) === ' ') {
                    snum++
                } else {
                    break
                }
            }
        }
        newText += line.substring(snum)
        if (i !== objReadline.length - 1) {
            newText += '\n'
        }
    }
    tab.getCodeMirror().doc.replaceSelection(newText);
})

//????????? HTML No Style ??????
ipcRenderer.on('export-html-no-style-file', () => {
    if (tab.getMarked().innerHTML.length < 1) {
        remote.dialog.showMessageBox({message: '?????????????????????'}).then()
        return
    }
    //????????? HTML ??????
    remote.dialog.showSaveDialog({
                                     defaultPath: tab.getTitle(),
                                     filters: [
                                         {name: 'html', extensions: ['html']}
                                     ]
                                 })
        .then(file => {
            if (!file.canceled) { //????????????????????????
                const filePath = file.filePath
                const data = htmlTel.headerNoStyle(tab.getTitle()) + tab.getMarked().innerHTML
                             + htmlTel.footer
                fs.writeFile(filePath, data, function (err) {
                    if (err) {
                        return console.error(err);
                    }
                    Toast.toast('????????????', 'success', 3000)
                });
            }
        })
        .catch(err => {
            console.log(err)
        })
})

//?????? HTML
ipcRenderer.on('export-html-file', function () {
    exportHtml()
})

function exportHtml() {
    if (tab.getMarked().innerHTML.length < 1) {
        remote.dialog.showMessageBox({message: '?????????????????????'}).then()
        return
    }
    //????????????????????????
    do {
        // console.log('copy')
        clipboard.clear()
        copyHtmlStyle()
    } while (!clipboard.readHTML())
    //?????????HTML??????
    remote.dialog.showSaveDialog({
                                     defaultPath: tab.getTitle(),
                                     filters: [
                                         {name: 'html', extensions: ['html']}
                                     ]
                                 })
        .then(file => {
            if (!file.canceled) { //????????????????????????
                const filePath = file.filePath
                const data = htmlTel.header(tab.getTitle()) + clipboard.readHTML() + htmlTel.footer
                fs.writeFile(filePath, data, function (err) {
                    if (err) {
                        return console.error(err);
                    }
                    Toast.toast('????????????', 'success', 3000)
                });
            }
        })
        .catch(err => {
            console.log(err)
        })
}


// ????????????????????????
ipcRenderer.on('flush-md-file',function () {
    fs.readFile(tab.getPath(), {encoding: 'utf8'} ,function (err, data) {
        if (err) {
            return console.error(err);
        }
        const tabId = tab.getId()
        createNewTab(data, tab.getPath())
        deleteTab(tabId)
    });
})