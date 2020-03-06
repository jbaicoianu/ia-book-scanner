function formatISBN(num) {
  return num.substr(0,3) + '-' + num[3] + '-' + num.substr(4, 3) + '-' + num.substr(7, 5) + '-' + num[12];
}
function formatBarcode(num) {
  return num[0] + ' ' + num.substr(1,6) + ' ' + num.substr(7, 6);
}

let bookscanner_template = `
<div id="intro">
  <select>
    <option>Default Camera</option>
  </select> <button>Start</button>
</div>
<div id="main">
  <div id="preview"></div>
  <video id="video" style="border: 1px solid gray"></video>
  <canvas>
  <input name="isbn" size="13">
</div>
`;

class BookScanner extends HTMLElement {
  constructor() {
    super();
  }
  connectedCallback(ev) {
    this.corsproxy = this.getAttribute('corsproxy') || '';
    this.fullscreen = this.getAttribute('fullscreen') || false;
    this.innerHTML = bookscanner_template;

    let intro = this.querySelector('#intro'),
        main = this.querySelector('#main');

    if (!main) {
      main = document.createElement('div');
      main.id = 'main';
      document.body.appendChild(main);
    }

    let isbn = main.querySelector('input'),
        canvas = main.querySelector('canvas'),
        ctx = canvas.getContext('2d'),
        statuswant = document.querySelector('#statuswant'),
        statusdontwant = document.querySelector('#statusdontwant');

    this.codeReader = new ZXing.BrowserMultiFormatReader(null, 16),
    this.codeReader.timeBetweenDecodingAttempts = 16;
    this.archivedata = {};
    this.isbndata = {};

    let drawdata = this.drawdata = {
      isbn: false,
      pos0: false,
      pos1: false,
      canvas: canvas,
      ctx: ctx
    };
    this.reticle = [
      {x: .25, y: .25},
      {x: .75, y: .75}
    ];
    let deviceselect = intro.querySelector('select'),
        startbutton = intro.querySelector('button');

    deviceselect.addEventListener('change', (ev) => {
      console.log('Changed device: ', deviceselect.value);
      this.selectedDeviceId = deviceselect.value;
    });
    window.addEventListener('orientationchange', (ev) => {
      this.drawCanvas();
      setTimeout(() => this.drawCanvas(), 250);
    });
    this.codeReader.getVideoInputDevices()
      .then(devices => {
        console.log('got devices', devices);
        devices.forEach(d => {
          console.log(d);
          let opt = document.createElement('option');
          opt.value = d.deviceId;
          opt.innerHTML = d.label;
          deviceselect.appendChild(opt);
        });
        //this.selectedDeviceId = devices[2].deviceId;
      });
    startbutton.addEventListener('click', () => {
      console.log('starting...');
      intro.className = 'hidden';
      if (this.fullscreen) {
        main.requestFullscreen();
      }
      this.codeReader.decodeFromVideoDevice(this.selectedDeviceId, 'video', (result, err) => {
        if (result) {
          let code = result.text;
          if (code.length == 13) {
            console.log('got it', result);
            //setTimeout(() => this.codeReader.reset(), 1000);
            if (code != drawdata.isbn) {
              window.navigator.vibrate(200);
              drawdata.isbn = code;
              this.checkIfHas(code);
              this.lookupISBN(code);
            }
            this.updateCanvasBox(result.resultPoints, result.text, true);
          }
        } else {
          //console.log(err);
        }
      });
      setTimeout(() => this.drawCanvas(), 1000);
    });
  }

  resetCanvas() {
    let drawdata = this.drawdata,
        video = drawdata.video,
        canvas = drawdata.canvas,
        ctx = drawdata.ctx;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    if (canvas.className != 'shown') {
      canvas.className = 'shown';
    }
    canvas.style.zoom = Math.min(video.offsetWidth / video.videoWidth, video.offsetHeight / video.videoHeight);

    ctx.strokeStyle = 'rgba(255,0,0,.4)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    //let reticle = this.reticle;
    //ctx.rect(canvas.width * reticle[0].x, canvas.height * reticle[0].y, (reticle[1].x - reticle[0].x) * canvas.width, (reticle[1].y - reticle[0].y) * canvas.height);
    let reticle = this.getReticlePoints();
    ctx.rect(reticle.p0.x, reticle.p0.y, reticle.width.x, reticle.width.y);
    ctx.stroke();
  }
  drawCanvas() {
    let drawdata = this.drawdata,
        ctx = drawdata.ctx;
    if (!drawdata.video) {
      drawdata.video = main.querySelector('video');
    }
    let video = drawdata.video;

    if (!video) return;

    this.resetCanvas();
    if (!drawdata.isbn || !drawdata.pos0 || !drawdata.pos1) return;

    let reticle = this.getReticlePoints();

    //ctx.drawImage(video, 0, 0);
    ctx.fillStyle = 'rgba(0, 255, 0, .2)'; 
    ctx.strokeStyle = 'rgba(0, 255, 0, .6)';

    let isbn = drawdata.isbn,
        p0 = drawdata.pos0,
        p1 = drawdata.pos1;
    let mid = {x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2};
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.fillStyle = 'black';
    ctx.font = '26px monospace';
    ctx.shadowColor = 'white';
    ctx.shadowBlur = 4;
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 1;
    let label = formatBarcode(isbn);
    let barcodedims = ctx.measureText(label);
    ctx.fontWeight = 'bold';
    ctx.strokeText(label, reticle.mid.x - barcodedims.width / 2, reticle.p1.y - 24);
    ctx.fillText(label, reticle.mid.x - barcodedims.width / 2, reticle.p1.y - 24);

    if (this.archivedata[isbn]) {
      let data = this.archivedata[isbn];
      if (data.response) {
        ctx.fillStyle = 'red';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 1;
        ctx.font = '128px sans-serif';
        ctx.fillText('❌', reticle.mid.x - 64, reticle.mid.y + 32);
        //ctx.strokeText('❌', reticle.mid.x - 64, reticle.mid.y + 32);
        //let imgheight = (128 / statuswant.width) * statuswant.height;
        //ctx.drawImage(statuswant, mid.x + 16, p0.y - imgheight - 40, 128, imgheight)
      } else {
        ctx.fillStyle = 'black';
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1;
        ctx.font = '128px sans-serif';
        ctx.fillText('✔️', reticle.mid.x - 64, reticle.mid.y + 32);
        //ctx.strokeText('✔️', reticle.mid.x - 64, reticle.mid.y + 32);
        //let imgheight = (128 / statusdontwant.width) * statusdontwant.height;
        //ctx.drawImage(statusdontwant, mid.x + 16, p0.y - imgheight - 40, 128, imgheight)
      }
      ctx.font = '24px sans-serif';
      ctx.fontWeight = 'bold';
      let dim = ctx.measureText(data.message);
      let textcenter = reticle.mid.x - dim.width / 2;
      ctx.strokeText(data.message, textcenter, reticle.mid.y - 96);
      ctx.fillText(data.message, textcenter, reticle.mid.y - 96);
    } else {
      ctx.fillStyle = 'grey';
      ctx.strokeStyle = 'grey';
      ctx.lineWidth = 1;
      ctx.font = '64px sans-serif';
      ctx.fillText('❔', p0.x - 32, p0.y - 32);
      ctx.strokeText('❔', p0.x - 32, p0.y - 32);
    }

    ctx.font = '24px sans-serif';
    ctx.fontWeight = 'bold';
    let title = '';
    let bookinfo = this.isbndata[isbn];
    if (bookinfo === false) {
      title = '(Unknown title)';
    } else if (bookinfo && bookinfo.title) {
      title = bookinfo.title;
    }
    if (title.length > 40) {
      title = title.substr(0, 40) + '...';
    }
    let dims = ctx.measureText(title);
    let textcenter = reticle.mid.x - dims.width / 2;
    ctx.strokeText(title, textcenter, reticle.p0.y - 12);
    ctx.fillText(title, textcenter, reticle.p0.y - 12);
  }
  getReticlePoints() {
    let reticle = this.reticle,
        canvas = this.drawdata.canvas;
    let points = {
      p0: {x: canvas.width * reticle[0].x, y: canvas.height * reticle[0].y},
      p1: {x: canvas.width * reticle[1].x, y: canvas.height * reticle[1].y},
    };
    points.mid = {x: (points.p0.x + points.p1.x) / 2, y: (points.p0.y + points.p1.y) / 2};
    points.width = {x: points.p1.x - points.p0.x, y: points.p1.y - points.p0.y};
    return points;
  }
  updateCanvasBox(corners, code, success) {
    let drawdata = this.drawdata;

    drawdata.isbn = code;
    drawdata.pos0 = corners[0];
    drawdata.pos1 = corners[1];

    this.drawCanvas();
  }
  updateCanvasData(code) {
    this.drawCanvas();
  }
  checkIfHas(isbn) {
    if (!this.archivedata[isbn]) {
      fetch(this.corsproxy + 'https://archive.org/services/book/v1/do_we_have_it/?isbn=' + isbn)
        .then(d => d.json())
        .then(j => {
          this.archivedata[isbn] = j
          this.updateCanvasData(isbn);
        });
    }
  }
  lookupISBN(isbn) {
    let bookid = 'ISBN:' + isbn;
    let apiurl = 'https://openlibrary.org/api/books?bibkeys=' + bookid + '&jscmd=data&format=json';
    if (!this.isbndata[isbn]) {
      fetch(apiurl)
        .then(r => r.json())
        .then(j => {
          this.isbndata[isbn] = j[bookid] || false;
          this.updateCanvasData(isbn);
        })
    }
  }
}
customElements.define('book-scanner', BookScanner);
