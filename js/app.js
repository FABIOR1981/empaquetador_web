function empaquetadorApp() {
    return {
        archivos: {},
        arbolArchivos: {},
        archivosHtml: [],
        archivoEntrada: 'index.html',
        archivoSeleccionado: null,
        contenidoEditor: '',
        opciones: {
            inlineCss: true,
            inlineJs: true,
            inlineImages: true
        },
        pestanaActiva: 'vistaPrevia',
        dispositivoVista: 'escritorio',
        htmlEmpaquetado: '',
        registros: [],
        estaArrastrando: false,
        copiado: false,

        inicializar() {
            this.agregarRegistro('Empaquetador Web Pro inicializado correctamente.', 'info');
        },

        obtenerCantidadArchivos() {
            return Object.keys(this.archivos).length;
        },

        estimarTamanoFinal() {
            let totalBytes = 0;
            for (const ruta in this.archivos) {
                totalBytes += this.archivos[ruta].tamano || 0;
            }
            // Margen estimado del 15% para etiquetas y envoltorios HTML finales
            totalBytes = Math.round(totalBytes * 1.15);
            return this.formatearBytes(totalBytes);
        },

        agregarRegistro(mensaje, tipo = 'info') {
            const ahora = new Date();
            const tiempo = ahora.toTimeString().split(' ')[0] + '.' + String(ahora.getMilliseconds()).padStart(3, '0');
            this.registros.push({ id: Math.random(), tiempo, mensaje, tipo });
        },

        formatearBytes(bytes, decimales = 2) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const dm = decimales < 0 ? 0 : decimales;
            const tamanos = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + tamanos[i];
        },

        obtenerIconoNodo(nodo) {
            const ruta = nodo.ruta || '';
            if (ruta.endsWith('.html')) return 'fa-solid fa-file-code text-orange-400';
            if (ruta.endsWith('.css')) return 'fa-solid fa-file-css text-cyan-400';
            if (ruta.endsWith('.js')) return 'fa-solid fa-file-lines text-yellow-400';
            if (/\.(png|jpg|jpeg|gif|webp|svg|ico)$/i.test(ruta)) return 'fa-solid fa-file-image text-emerald-400';
            if (/\.(woff|woff2|ttf|eot)$/i.test(ruta)) return 'fa-solid fa-font text-purple-400';
            return 'fa-solid fa-file text-slate-400';
        },

        async manejarSeleccionCarpeta(evento) {
            const listaArchivos = evento.target.files;
            if (!listaArchivos || listaArchivos.length === 0) return;
            await this.procesarListaArchivos(listaArchivos);
            evento.target.value = '';
        },

        async manejarSeleccionArchivos(evento) {
            const listaArchivos = evento.target.files;
            if (!listaArchivos || listaArchivos.length === 0) return;
            await this.procesarListaArchivos(listaArchivos);
            evento.target.value = '';
        },

        async manejarSeleccionZip(evento) {
            const archivo = evento.target.files[0];
            if (!archivo) return;
            this.agregarRegistro(`Descomprimiendo archivo ZIP: ${archivo.name}...`, 'info');
            try {
                const zip = new JSZip();
                const contenidoZip = await zip.loadAsync(archivo);
                const tempArchivos = { ...this.archivos };

                for (const [rutaRelativa, entradaZip] of Object.entries(contenidoZip.files)) {
                    if (entradaZip.dir) continue;
                    if (rutaRelativa.includes('__MACOSX') || rutaRelativa.startsWith('.')) continue;

                    const esBinario = /\.(png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|eot|pdf)$/i.test(rutaRelativa);
                    let contenido;
                    if (esBinario) {
                        const blob = await entradaZip.async('blob');
                        contenido = await this.blobADataURL(blob);
                    } else {
                        contenido = await entradaZip.async('text');
                    }

                    const rutaLimpia = rutaRelativa.startsWith('/') ? rutaRelativa.substring(1) : rutaRelativa;
                    tempArchivos[rutaLimpia] = {
                        contenido: contenido,
                        tamano: esBinario ? Math.round(contenido.length * 0.75) : contenido.length,
                        esBinario: esBinario,
                        tipoMime: this.obtenerTipoMime(rutaLimpia)
                    };
                    this.agregarRegistro(`Extraído del ZIP: ${rutaLimpia}`, 'exito');
                }

                this.archivos = tempArchivos;
                this.finalizarProcesamiento();
            } catch (err) {
                this.agregarRegistro(`Error al procesar el archivo ZIP: ${err.message}`, 'error');
            }
            evento.target.value = '';
        },

        async manejarSoltado(evento) {
            this.estaArrastrando = false;
            const items = evento.dataTransfer.items;
            const archivos = evento.dataTransfer.files;

            if (archivos.length === 1 && archivos[0].name.endsWith('.zip')) {
                const eventoSim = { target: { files: archivos } };
                await this.manejarSeleccionZip(eventoSim);
                return;
            }

            const listaArchivos = [];
            if (items) {
                for (let i = 0; i < items.length; i++) {
                    const item = items[i].webkitGetAsEntry ? items[i].webkitGetAsEntry() : null;
                    if (item) {
                        await this.recorrerArbolArchivos(item, '', listaArchivos);
                    } else {
                        const f = items[i].getAsFile();
                        if (f) listaArchivos.push(f);
                    }
                }
            }
            if (listaArchivos.length > 0) {
                await this.procesarListaArchivos(listaArchivos);
            }
        },

        async recorrerArbolArchivos(item, ruta, listaArchivos) {
            if (item.isFile) {
                await new Promise((resolver) => {
                    item.file(archivo => {
                        archivo.fullPath = ruta + archivo.name;
                        listaArchivos.push(archivo);
                        resolver();
                    });
                });
            } else if (item.isDirectory) {
                const lectorDir = item.createReader();
                await new Promise((resolver) => {
                    lectorDir.readEntries(async entradas => {
                        for (let i = 0; i < entradas.length; i++) {
                            await this.recorrerArbolArchivos(entradas[i], ruta + item.name + '/', listaArchivos);
                        }
                        resolver();
                    });
                });
            }
        },

        async procesarListaArchivos(listaArchivos) {
            this.agregarRegistro(`Procesando ${listaArchivos.length} archivo(s)...`, 'info');
            const tempArchivos = { ...this.archivos };
            for (let i = 0; i < listaArchivos.length; i++) {
                const archivo = listaArchivos[i];
                let ruta = archivo.webkitRelativePath || archivo.fullPath || archivo.name;
                ruta = ruta.startsWith('/') ? ruta.substring(1) : ruta;
                if (ruta.includes('__MACOSX') || ruta.startsWith('.')) continue;

                const esBinario = /\.(png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|eot|pdf)$/i.test(ruta);
                let contenido = '';
                if (esBinario) {
                    contenido = await this.leerComoDataURL(archivo);
                } else {
                    contenido = await this.leerComoTexto(archivo);
                }

                tempArchivos[ruta] = {
                    contenido: contenido,
                    tamano: archivo.size,
                    esBinario: esBinario,
                    tipoMime: archivo.type || this.obtenerTipoMime(ruta)
                };
                this.agregarRegistro(`Cargado: ${ruta} (${this.formatearBytes(archivo.size)})`, 'exito');
            }
            this.archivos = tempArchivos;
            this.finalizarProcesamiento();
        },

        finalizarProcesamiento() {
            const rutas = Object.keys(this.archivos);
            this.archivosHtml = rutas.filter(p => p.endsWith('.html'));
            if (!this.archivosHtml.includes(this.archivoEntrada)) {
                this.archivoEntrada = this.archivosHtml.length > 0 ? this.archivosHtml[0] : '';
            }

            const tempArbol = {};
            for (const ruta of rutas) {
                tempArbol[ruta] = { ruta: ruta, tamano: this.archivos[ruta].tamano };
            }
            this.arbolArchivos = tempArbol;

            if (!this.archivoSeleccionado && rutas.length > 0) {
                this.seleccionarArchivo(this.archivoEntrada || rutas[0]);
            }
            
            this.archivos = { ...this.archivos };
            this.arbolArchivos = { ...this.arbolArchivos };

            this.agregarRegistro(`Proyecto listo. Archivo principal detectado: ${this.archivoEntrada}`, 'exito');
        },

        leerComoTexto(archivo) {
            return new Promise((resolver, rechazar) => {
                const lector = new FileReader();
                lector.onload = e => resolver(e.target.result);
                lector.onerror = e => rechazar(e);
                lector.readAsText(archivo);
            });
        },

        leerComoDataURL(archivo) {
            return new Promise((resolver, rechazar) => {
                const lector = new FileReader();
                lector.onload = e => resolver(e.target.result);
                lector.onerror = e => rechazar(e);
                lector.readAsDataURL(archivo);
            });
        },

        blobADataURL(blob) {
            return new Promise((resolver, rechazar) => {
                const lector = new FileReader();
                lector.onload = e => resolver(e.target.result);
                lector.onerror = e => rechazar(e);
                lector.readAsDataURL(blob);
            });
        },

        obtenerTipoMime(nombreArchivo) {
            if (nombreArchivo.endsWith('.html')) return 'text/html';
            if (nombreArchivo.endsWith('.css')) return 'text/css';
            if (nombreArchivo.endsWith('.js')) return 'application/javascript';
            if (nombreArchivo.endsWith('.png')) return 'image/png';
            if (nombreArchivo.endsWith('.jpg') || nombreArchivo.endsWith('.jpeg')) return 'image/jpeg';
            if (nombreArchivo.endsWith('.svg')) return 'image/svg+xml';
            if (nombreArchivo.endsWith('.webp')) return 'image/webp';
            if (nombreArchivo.endsWith('.gif')) return 'image/gif';
            if (nombreArchivo.endsWith('.ico')) return 'image/x-icon';
            return 'application/octet-stream';
        },

        seleccionarArchivo(ruta) {
            this.archivoSeleccionado = ruta;
            const datosArchivo = this.archivos[ruta];
            if (datosArchivo && !datosArchivo.esBinario) {
                this.contenidoEditor = datosArchivo.contenido;
            } else if (datosArchivo && datosArchivo.esBinario) {
                this.contenidoEditor = '[Archivo Binario / Imagen Base64 - No editable directamente]\n' + datosArchivo.contenido.substring(0, 100) + '...';
            }
            this.pestanaActiva = 'editor';
        },

        guardarArchivoActual() {
            if (!this.archivoSeleccionado) return;
            const datosArchivo = this.archivos[this.archivoSeleccionado];
            if (datosArchivo && !datosArchivo.esBinario) {
                datosArchivo.contenido = this.contenidoEditor;
                datosArchivo.tamano = this.contenidoEditor.length;
                this.agregarRegistro(`Guardados cambios en: ${this.archivoSeleccionado}`, 'exito');
            }
        },

        eliminarArchivo(ruta) {
            const tempArchivos = { ...this.archivos };
            delete tempArchivos[ruta];
            this.archivos = tempArchivos;
            this.finalizarProcesamiento();
            if (this.archivoSeleccionado === ruta) {
                this.archivoSeleccionado = null;
                this.contenidoEditor = '';
            }
            this.agregarRegistro(`Archivo eliminado: ${ruta}`, 'info');
        },

        limpiarTodo() {
            this.archivos = {};
            this.arbolArchivos = {};
            this.archivosHtml = [];
            this.archivoEntrada = '';
            this.archivoSeleccionado = null;
            this.contenidoEditor = '';
            this.htmlEmpaquetado = '';
            this.registros = [];
            this.agregarRegistro('Proyecto limpiado por completo.', 'info');
        },

        async cargarProyectoDemo() {
            this.limpiarTodo();
            this.agregarRegistro('Cargando proyecto demo con múltiples subcarpetas...', 'info');

            const htmlDemo = '<!DOCTYPE html>\n' +
                '<html lang="es">\n' +
                '<head>\n' +
                '    <meta charset="UTF-8">\n' +
                '    <title>Demo Multi-Subcarpeta</title>\n' +
                '    <link rel="stylesheet" href="css/main.css">\n' +
                '</head>\n' +
                '<body class="bg-slate-900 text-white min-h-screen flex items-center justify-center p-6">\n' +
                '    <div class="max-w-md w-full bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700 text-center space-y-4">\n' +
                '        <img src="assets/images/logo.svg" alt="Logo" class="w-20 h-20 mx-auto">\n' +
                '        <h1 class="text-2xl font-bold text-indigo-400">¡Proyecto con Subcarpetas Empaquetado!</h1>\n' +
                '        <p class="text-slate-300 text-sm">Este archivo unifica index.html, css/main.css, js/modules/app.js y assets/images/logo.svg en un solo archivo autónomo.</p>\n' +
                '        <button id="boton-accion" class="bg-indigo-600 hover:bg-indigo-500 px-6 py-2.5 rounded-xl text-sm font-semibold transition shadow-lg cursor-pointer">Probar JavaScript</button>\n' +
                '        <div id="mensaje" class="text-emerald-400 text-xs font-mono"></div>\n' +
                '    </div>\n' +
                '    <script src="js/modules/app.js"><\/script>\n' +
                '</body>\n' +
                '</html>';

            const cssDemo = '/* Archivo CSS en subcarpeta css/ */\n' +
                'body {\n' +
                '    font-family: system-ui, sans-serif;\n' +
                '    background-image: url(\'../assets/images/bg-pattern.svg\');\n' +
                '}\n' +
                '.card-brillo {\n' +
                '    box-shadow: 0 0 25px rgba(99, 102, 241, 0.3);\n' +
                '}';

            const jsDemo = '/* Archivo JS en subcarpeta js/modules/ */\n' +
                'document.addEventListener(\'DOMContentLoaded\', () => {\n' +
                '    const boton = document.getElementById(\'boton-accion\');\n' +
                '    const mensaje = document.getElementById(\'mensaje\');\n' +
                '    if(boton) {\n' +
                '        boton.addEventListener(\'click\', () => {\n' +
                '            mensaje.textContent = \'¡Hola desde app.js modular ejecutándose sin conexión!\';\n' +
                '        });\n' +
                '    }\n' +
                '});';

            const svgLogo = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#6366f1"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>';
            const svgPattern = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="1" fill="#334155"/></svg>';

            const archivosDemo = {
                'index.html': htmlDemo,
                'css/main.css': cssDemo,
                'js/modules/app.js': jsDemo,
                'assets/images/logo.svg': svgLogo,
                'assets/images/bg-pattern.svg': svgPattern
            };

            const tempArchivos = {};
            for (const [ruta, contenido] of Object.entries(archivosDemo)) {
                const esBinario = ruta.endsWith('.svg');
                let contenidoFinal = contenido;
                if (esBinario) {
                    contenidoFinal = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(contenido)));
                }
                tempArchivos[ruta] = {
                    contenido: contenidoFinal,
                    tamano: contenidoFinal.length,
                    esBinario: esBinario,
                    tipoMime: this.obtenerTipoMime(ruta)
                };
            }

            this.archivos = tempArchivos;
            this.finalizarProcesamiento();
            this.empaquetarProyecto();
        },

        resolverRuta(rutaBase, rutaRelativa) {
            if (!rutaRelativa || rutaRelativa.startsWith('http://') || rutaRelativa.startsWith('https://') || rutaRelativa.startsWith('data:') || rutaRelativa.startsWith('#') || rutaRelativa.startsWith('mailto:')) {
                return rutaRelativa;
            }
            const relLimpia = rutaRelativa.split('?')[0].split('#')[0];
            const dirBase = rutaBase.includes('/') ? rutaBase.substring(0, rutaBase.lastIndexOf('/') + 1) : '';
            const pila = dirBase ? dirBase.split('/').filter(Boolean) : [];
            const partes = relLimpia.split('/');

            for (const parte of partes) {
                if (parte === '.' || parte === '') continue;
                if (parte === '..') {
                    pila.pop();
                } else {
                    pila.push(parte);
                }
            }
            return pila.join('/');
        },

        async empaquetarProyecto() {
            if (!this.archivoEntrada || !this.archivos[this.archivoEntrada]) {
                this.agregarRegistro('Error: Selecciona un archivo HTML principal válido.', 'error');
                return;
            }

            this.agregarRegistro(`Iniciando empaquetado desde: ${this.archivoEntrada}...`, 'info');
            
            const datosEntrada = this.archivos[this.archivoEntrada];
            let contenidoHtml = datosEntrada.contenido;

            const analizador = new DOMParser();
            const doc = analizador.parseFromString(contenidoHtml, 'text/html');

            // 1. Procesar CSS <link rel="stylesheet">
            if (this.opciones.inlineCss) {
                const enlaces = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'));
                for (const enlace of enlaces) {
                    const href = enlace.getAttribute('href');
                    if (!href) continue;
                    const rutaResuelta = this.resolverRuta(this.archivoEntrada, href);
                    if (this.archivos[rutaResuelta]) {
                        let textoCss = this.archivos[rutaResuelta].contenido;
                        textoCss = await this.procesarUrlsCss(textoCss, rutaResuelta);

                        const etiquetaEstilo = doc.createElement('style');
                        etiquetaEstilo.textContent = `/* Empaquetado desde: ${rutaResuelta} */\n` + textoCss;
                        enlace.replaceWith(etiquetaEstilo);
                        this.agregarRegistro(`CSS inyectado: ${rutaResuelta}`, 'exito');
                    } else {
                        this.agregarRegistro(`Aviso: No se encontró el archivo CSS '${href}' (resuelto como '${rutaResuelta}')`, 'aviso');
                    }
                }
            }

            // 2. Procesar JavaScript <script src="...">
            if (this.opciones.inlineJs) {
                const scripts = Array.from(doc.querySelectorAll('script[src]'));
                for (const script of scripts) {
                    const src = script.getAttribute('src');
                    if (!src) continue;
                    const rutaResuelta = this.resolverRuta(this.archivoEntrada, src);
                    if (this.archivos[rutaResuelta]) {
                        const textoJs = this.archivos[rutaResuelta].contenido;
                        const etiquetaScript = doc.createElement('script');
                        etiquetaScript.textContent = `/* Empaquetado desde: ${rutaResuelta} */\n` + textoJs;
                        Array.from(script.attributes).forEach(attr => {
                            if (attr.name !== 'src') etiquetaScript.setAttribute(attr.name, attr.value);
                        });
                        script.replaceWith(etiquetaScript);
                        this.agregarRegistro(`JavaScript inyectado: ${rutaResuelta}`, 'exito');
                    } else {
                        this.agregarRegistro(`Aviso: No se encontró el archivo JS '${src}' (resuelto como '${rutaResuelta}')`, 'aviso');
                    }
                }
            }

            // 3. Procesar Imágenes <img src="...">
            if (this.opciones.inlineImages) {
                const imagenes = Array.from(doc.querySelectorAll('img[src]'));
                for (const img of imagenes) {
                    const src = img.getAttribute('src');
                    if (!src) continue;
                    const rutaResuelta = this.resolverRuta(this.archivoEntrada, src);
                    if (this.archivos[rutaResuelta]) {
                        const datosArchivo = this.archivos[rutaResuelta];
                        img.setAttribute('src', datosArchivo.contenido);
                        this.agregarRegistro(`Imagen inyectada a Base64: ${rutaResuelta}`, 'exito');
                    } else {
                        this.agregarRegistro(`Aviso: No se encontró la imagen '${src}' (resuelto como '${rutaResuelta}')`, 'aviso');
                    }
                }
            }

            this.htmlEmpaquetado = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
            this.agregarRegistro(`¡Empaquetado completado! Tamaño final: ${this.formatearBytes(this.htmlEmpaquetado.length)}`, 'exito');

            this.actualizarVistaPrevia();
        },

        async procesarUrlsCss(textoCss, rutaCss) {
            const regexUrl = /url\(['"]?([^'")]+)['"]?\)/g;
            let coincidencia;
            let nuevoCss = textoCss;

            while ((coincidencia = regexUrl.exec(textoCss)) !== null) {
                const urlOriginal = coincidencia[1];
                if (urlOriginal.startsWith('data:') || urlOriginal.startsWith('http://') || urlOriginal.startsWith('https://')) {
                    continue;
                }
                const rutaRecursoResuelta = this.resolverRuta(rutaCss, urlOriginal);
                if (this.archivos[rutaRecursoResuelta]) {
                    const datosRecurso = this.archivos[rutaRecursoResuelta];
                    nuevoCss = nuevoCss.replace(coincidencia[0], `url('${datosRecurso.contenido}')`);
                    this.agregarRegistro(`Recurso CSS incrustado (url): ${rutaRecursoResuelta}`, 'exito');
                } else {
                    this.agregarRegistro(`Aviso en CSS: No se encontró '${urlOriginal}' (resuelto como '${rutaRecursoResuelta}')`, 'aviso');
                }
            }
            return nuevoCss;
        },

        actualizarVistaPrevia() {
            this.pestanaActiva = 'vistaPrevia';
            setTimeout(() => {
                const iframe = document.getElementById('iframe-vista');
                if (iframe) {
                    iframe.srcdoc = this.htmlEmpaquetado;
                }
            }, 100);
        },

        copiarCodigo() {
            const textarea = document.createElement('textarea');
            textarea.value = this.htmlEmpaquetado;
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                this.copiado = true;
                setTimeout(() => this.copiado = false, 2000);
                this.agregarRegistro('Código copiado al portapapeles.', 'exito');
            } catch (err) {
                this.agregarRegistro('Error al copiar al portapapeles.', 'error');
            }
            document.body.removeChild(textarea);
        },

        descargarPaquete() {
            const blob = new Blob([this.htmlEmpaquetado], { type: 'text/html;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'index.html';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            this.agregarRegistro('Archivo index.html descargado con éxito.', 'exito');
        }
    }
}