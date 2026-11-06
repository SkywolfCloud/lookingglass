window.renderLookingGlassTerminal = async function ({outputCard, outputContent, executeButton}) {
    executeButton.innerText = 'Executing...';
    executeButton.disabled = true;
    outputCard.classList.remove('d-none');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 70000);
    let terminal;
    let resizeObserver;
    const onUnload = () => { controller.abort(); resizeObserver?.disconnect(); terminal?.dispose(); };
    window.addEventListener('beforeunload', onUnload, {once: true});
    try {
        if (typeof Terminal !== 'undefined' && typeof FitAddon !== 'undefined') {
            const host = document.createElement('div');
            host.className = 'lg-terminal';
            host.setAttribute('aria-label', 'Network test output, read-only');
            outputContent.before(host);
            outputContent.hidden = true;
            const darkColors = ['#adb5bd','#ff8787','#75d69c','#ffe083','#86b7fe','#e599f7','#6edff6','#dee2e6','#adb5bd','#ffa8a8','#8ce99a','#ffec99','#a5c8ff','#eebefa','#99e9f2','#f8f9fa'];
            const names = ['black','red','green','yellow','blue','magenta','cyan','white','brightBlack','brightRed','brightGreen','brightYellow','brightBlue','brightMagenta','brightCyan','brightWhite'];
            const getTheme = () => {
                const theme = {background: '#0d1117',foreground: '#dee2e6',cursor: '#0d1117',selectionBackground: '#426188'};
                names.forEach((name, i) => theme[name] = darkColors[i]);
                host.style.backgroundColor = theme.background;
                return theme;
            };
            terminal = new Terminal({disableStdin: true,convertEol: true,cursorBlink: false,cursorInactiveStyle: 'none',fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',fontSize: 14,lineHeight: 1.2,scrollback: 3000,minimumContrastRatio: 4.5,theme: getTheme()});
            const fit = new FitAddon.FitAddon();
            terminal.loadAddon(fit);
            terminal.open(host);
            await document.fonts.ready;
            fit.fit();
            resizeObserver = new ResizeObserver(() => { if (host.clientWidth > 0) fit.fit(); });
            resizeObserver.observe(host);
        }
        const response = await fetch('backend.php', {signal: controller.signal});
        if (!response.ok || !response.body) throw new Error('Trace request failed.');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let plainOutput = '';
        const showPlainOutput = () => {
            outputContent.textContent = plainOutput.replace(/\x1b\[[0-?]*[ -\/]*[@-~]/g, '');
        };
        while (true) {
            const {done, value} = await reader.read();
            if (done) break;
            if (terminal) {
                await new Promise(resolve => terminal.write(value, resolve));
            } else {
                // Safe plain text fallback if the terminal assets could not load.
                plainOutput += decoder.decode(value, {stream: true});
                showPlainOutput();
            }
        }
        if (!terminal) { plainOutput += decoder.decode(); showPlainOutput(); }
    } catch (error) {
        const message = error.name === 'AbortError' ? 'Trace request timed out.' : 'Unable to load trace output. Please retry.';
        if (terminal) terminal.writeln('\r\n\x1b[31m' + message + '\x1b[0m');
        else outputContent.textContent += '\n' + message;
    } finally {
        clearTimeout(timeout);
        executeButton.innerText = 'Execute';
        executeButton.disabled = false;
        outputCard.dataset.traceComplete = 'true';
    }
};
