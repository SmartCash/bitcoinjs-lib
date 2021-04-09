const { Buffer } = require('safe-buffer');
const bech32 = require('bech32');
const bs58check = require('bs58smartcheck');
const typeforce = require('typeforce');
const bscript = require('./script');
const btemplates = require('./templates');
const networks = require('./networks');
const types = require('./types');

function fromBase58Check(address) {
    const payload = bs58check.decode(address);

    // TODO: 4.0.0, move to "toOutputScript"
    if (payload.length < 21) throw new TypeError(`${address} is too short`);
    if (payload.length > 21) throw new TypeError(`${address} is too long`);

    const version = payload.readUInt8(0);
    const hash = payload.slice(1);

    return { version: version, hash: hash };
}

function fromBech32(address) {
    const result = bech32.decode(address);
    const data = bech32.fromWords(result.words.slice(1));

    return {
        version: result.words[0],
        prefix: result.prefix,
        data: Buffer.from(data),
    };
}

function toBase58Check(hash, version) {
    typeforce(types.tuple(types.Hash160bit, types.UInt8), arguments);

    const payload = Buffer.allocUnsafe(21);
    payload.writeUInt8(version, 0);
    hash.copy(payload, 1);

    return bs58check.encode(payload);
}

function toBech32(data, version, prefix) {
    const words = bech32.toWords(data);
    words.unshift(version);

    return bech32.encode(prefix, words);
}

function fromOutputScript(outputScript, network) {
    network = network || networks.bitcoin;

    if (btemplates.pubKeyHash.output.check(outputScript))
        return toBase58Check(bscript.compile(outputScript).slice(3, 23), network.pubKeyHash);
    if (btemplates.scriptHash.output.check(outputScript))
        return toBase58Check(bscript.compile(outputScript).slice(2, 22), network.scriptHash);
    if (btemplates.witnessPubKeyHash.output.check(outputScript))
        return toBech32(bscript.compile(outputScript).slice(2, 22), 0, network.bech32);
    if (btemplates.witnessScriptHash.output.check(outputScript))
        return toBech32(bscript.compile(outputScript).slice(2, 34), 0, network.bech32);

    throw new Error(`${bscript.toASM(outputScript)} has no matching Address`);
}

function toOutputScript(address, network) {
    network = network || networks.bitcoin;

    let decode;
    try {
        decode = fromBase58Check(address);
    } catch (e) {}

    if (decode) {
        if (decode.version === network.pubKeyHash) return btemplates.pubKeyHash.output.encode(decode.hash);
        if (decode.version === network.scriptHash) return btemplates.scriptHash.output.encode(decode.hash);
    } else {
        try {
            decode = fromBech32(address);
        } catch (e) {}

        if (decode) {
            if (decode.prefix !== network.bech32) throw new Error(`${address} has an invalid prefix`);
            if (decode.version === 0) {
                if (decode.data.length === 20) return btemplates.witnessPubKeyHash.output.encode(decode.data);
                if (decode.data.length === 32) return btemplates.witnessScriptHash.output.encode(decode.data);
            }
        }
    }

    throw new Error(`${address} has no matching Script`);
}

module.exports = {
    fromBase58Check: fromBase58Check,
    fromBech32: fromBech32,
    fromOutputScript: fromOutputScript,
    toBase58Check: toBase58Check,
    toBech32: toBech32,
    toOutputScript: toOutputScript,
};
