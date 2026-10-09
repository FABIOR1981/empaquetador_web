function empaquetadorApp() {
    return {
        archivos: {},
        arbolArchivos: {},
        archivoSeleccionado: null,
        contenidoEditor: '',
        filtroArbol: '',
        opciones: {
            excluirBinarios: true
        },
        pestanaActiva: 'bundle',
        bundleAi: '',
        registros: [],
        estaArrastrando: false,
        copiado: false,

        inicializar() {
            this.agregarRegistro('AI Code Bundler inicializado correctamente.', 'info');
        },

        obtenerCantidadArchivos() {
            return Object.keys(this.archivos).length;
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
            return 'fa-solid fa-file text-slate-400';
        },

        // Filtro para excluir carpetas y archivos basura del sistema (node_modules, .git, etc.)
        esArchivoIgnorable(ruta) {
            const patronesIgnorados = /(^|\/)(node_modules|\.git|\.next|dist|build|\.DS_Store|__MACOSX)(\/|$)/i;
            return patronesIgnorados.test(ruta);
        },

        filtrarArbol() {
            if (!this.filtroArbol) return this.arbolArchivos;
            const filtrado = {};
            for (const [ruta, nodo] of Object.entries(this.arbolArchivos)) {
                if (ruta.toLowerCase().includes(this.filtroArbol.toLowerCase())) {
                    filtrado[ruta] = nodo;
                }
            }
            return filtrado;
        },

        async manejarSeleccionCarpeta(evento) {
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
                    
                    const rutaLimpia = rutaRelativa.startsWith('/') ? rutaRelativa.substring(1) : rutaRelativa;
                    if (this.esArchivoIgnorable(rutaLimpia)) continue;

                    const esBinario = /\.(png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|eot|pdf|zip)$/i.test(rutaLimpia);
                    let contenido = esBinario ? '[Archivo Binario]' : await entradaZip.async('text');

                    tempArchivos[rutaLimpia] = {
                        contenido: contenido,
                        tamano: contenido.length,
                        esBinario: esBinario
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
            const archivos = evento.dataTransfer.files;
            if (archivos.length === 1 && archivos[0].name.endsWith('.zip')) {
                await this.manejarSeleccionZip({ target: { files: archivos } });
                return;
            }
            const listaArchivos = [];
            const items = evento.dataTransfer.items;
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

                if (this.esArchivoIgnorable(ruta)) continue;

                const esBinario = /\.(png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|eot|pdf|zip)$/i.test(ruta);
                let contenido = '';
                if (esBinario) {
                    contenido = '[Archivo Binario Omitido]';
                } else {
                    contenido = await this.leerComoTexto(archivo);
                }

                tempArchivos[ruta] = {
                    contenido: contenido,
                    tamano: archivo.size,
                    esBinario: esBinario
                };
                this.agregarRegistro(`Cargado: ${ruta}`, 'exito');
            }
            this.archivos = tempArchivos;
            this.finalizarProcesamiento();
        },

        finalizarProcesamiento() {
            const rutas = Object.keys(this.archivos).sort();
            const tempArbol = {};
            for (const ruta of rutas) {
                tempArbol[ruta] = { ruta: ruta, tamano: this.archivos[ruta].tamano };
            }
            this.arbolArchivos = tempArbol;

            if (!this.archivoSeleccionado && rutas.length > 0) {
                this.seleccionarArchivo(rutas[0]);
            }
            this.archivos = { ...this.archivos };
            this.arbolArchivos = { ...this.arbolArchivos };
            this.agregarRegistro('Estructura de archivos lista.', 'exito');
            this.generarBundleParaIa();
        },

        leerComoTexto(archivo) {
            return new Promise((resolver, rechazar) => {
                const lector = new FileReader();
                lector.onload = e => resolver(e.target.result);
                lector.onerror = e => rechazar(e);
                lector.readAsText(archivo);
            });
        },

        seleccionarArchivo(ruta) {
            this.archivoSeleccionado = ruta;
            const datosArchivo = this.archivos[ruta];
            if (datosArchivo && !datosArchivo.esBinario) {
                this.contenidoEditor = datosArchivo.contenido;
            } else {
                this.contenidoEditor = '[Archivo binario o no editable]';
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
                this.generarBundleParaIa();
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
            this.archivoSeleccionado = null;
            this.contenidoEditor = '';
            this.bundleAi = '';
            this.registros = [];
            this.agregarRegistro('Proyecto limpiado.', 'info');
        },

        async cargarProyectoDemo() {
            this.limpiarTodo();
            this.agregarRegistro('Cargando proyecto demo...', 'info');

            const archivosDemo = {
                'index.html': '<!DOCTYPE html>\n<html>\n<head>\n<link rel="stylesheet" href="css/estilos.css">\n</head>\n<body>\n<h1>Hola</h1>\n<script src="js/app.js"></script>\n</body>\n</html>',
                'css/estilos.css': 'body { background: #111; color: #fff; font-family: sans-serif; }',
                'js/app.js': 'console.log("Hola desde app.js modular");'
            };

            const tempArchivos = {};
            for (const [ruta, contenido] of Object.entries(archivosDemo)) {
                tempArchivos[ruta] = {
                    contenido: contenido,
                    tamano: contenido.length,
                    esBinario: false
                };
            }

            this.archivos = tempArchivos;
            this.finalizarProcesamiento();
        },

        generarBundleParaIa() {
            this.agregarRegistro('Generando Bundle Markdown para IA...', 'info');
            let output = `# Bundle del Proyecto para IA\n\n`;
            output += `## Estructura de Archivos\n`;

            const rutas = Object.keys(this.archivos).sort();
            rutas.forEach(ruta => {
                output += `- ${ruta}\n`;
            });
            output += `\n---\n\n## Código Fuente\n\n`;

            for (const ruta of rutas) {
                const archivo = this.archivos[ruta];
                if (this.opciones.excluirBinarios && archivo.esBinario) continue;

                const extension = ruta.split('.').pop().toLowerCase();
                let lang = extension;
                if (extension === 'js') lang = 'javascript';
                if (extension === 'html') lang = 'html';
                if (extension === 'css') lang = 'css';
                if (extension === 'json') lang = 'json';

                output += `### Archivo: \`${ruta}\`\n`;
                output += `\`\`\`${lang}\n`;
                output += archivo.contenido + '\n';
                output += `\`\`\`\n\n`;
            }

            this.bundleAi = output;
            this.agregarRegistro(`Bundle generado con éxito (${this.formatearBytes(output.length)})`, 'exito');
        },

        copiarCodigo() {
            const textarea = document.createElement('textarea');
            textarea.value = this.bundleAi;
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                this.copiado = true;
                setTimeout(() => this.copiado = false, 2000);
                this.agregarRegistro('Markdown copiado al portapapeles.', 'exito');
            } catch (err) {
                this.agregarRegistro('Error al copiar.', 'error');
            }
            document.body.removeChild(textarea);
        },

        descargarBundle() {
            const blob = new Blob([this.bundleAi], { type: 'text/markdown;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'proyecto-para-ia.md';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            this.agregarRegistro('Archivo proyecto-para-ia.md descargado.', 'exito');
        }
    }
}