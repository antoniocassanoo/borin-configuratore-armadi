// Collaudo del motore in Photoshop (Mac), senza pannello.
// osascript -e 'with timeout of 900 seconds' -e 'tell application id "com.adobe.Photoshop" to do javascript "$.setenv(\"EST\",\"<estensione>\"); $.setenv(\"FUNZ\",\"anteprime\"); $.setenv(\"ARG\",\"<file .json con gli argomenti>\"); $.setenv(\"OUT\",\"<file .json del risultato>\"); $.evalFile(\"<questo file>\");"' -e 'end timeout'
#target photoshop
(function () {
    var est = $.getenv("EST"), funz = $.getenv("FUNZ"), arg = $.getenv("ARG"), out = $.getenv("OUT");
    $.evalFile(new File(est + "/jsx/armadi.jsx"));
    ARMADI.chiama("caricaBatch", encodeURIComponent('{"file":' + ARMADI.json(est + "/jsx/borin_motore.jsx") + '}'));
    var fa = new File(arg); fa.encoding = "UTF-8"; fa.open("r"); var testo = fa.read(); fa.close();
    var t0 = new Date().getTime();
    var r = decodeURIComponent(ARMADI.chiama(funz, encodeURIComponent(testo)));
    var fo = new File(out); fo.encoding = "UTF-8"; fo.open("w"); fo.write(r); fo.close();
    return "ok " + ((new Date().getTime() - t0) / 1000) + " s";
})();
