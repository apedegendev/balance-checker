// Подавление предупреждений о punycode перед загрузкой модулей
process.removeAllListeners('warning');
process.on('warning', (warning) => {
  if (warning.code === 'DEP0040') return;
});

const { Web3 } = require('web3');
const fs = require('fs');
const ExcelJS = require('exceljs');

// Настройка задержки (в секундах)
const DELAY_MIN = 0.1;
const DELAY_MAX = 0.3;

function delay(minSeconds, maxSeconds) {
  const timeSeconds = Math.random() * (maxSeconds - minSeconds) + minSeconds;
  const roundedTimeSeconds = parseFloat(timeSeconds.toFixed(2));
  const timeMs = roundedTimeSeconds * 1000;
  return new Promise(resolve => setTimeout(resolve, timeMs));
}

const wallets = fs.readFileSync('wallets.txt', 'utf8')
  .split('\n')
  .map(wallet => wallet.trim())
  .filter(wallet => wallet && /^0x[a-fA-F0-9]{40}$/.test(wallet));

const networks = fs.readFileSync('networks.txt', 'utf8')
  .split('\n')
  .map(line => line.trim())
  .filter(line => line)
  .map(line => {
    const [name, rpcUrl, tokenAddresses] = line.split('|');
    return {
      name,
      rpcUrl,
      tokens: tokenAddresses ? tokenAddresses.split(',').map(addr => addr.trim()) : [],
    };
  });

const erc20Abi = [
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    type: 'function',
  },
];

async function getNativeBalance(web3, wallet) {
  try {
    const balance = await web3.eth.getBalance(wallet);
    return web3.utils.fromWei(balance, 'ether');
  } catch (error) {
    console.log(`Native balance error for ${wallet}: ${error.message}`);
    return 'RPC Error';
  }
}

async function getTokenBalance(web3, wallet, tokenAddress) {
  try {
    const tokenContract = new web3.eth.Contract(erc20Abi, tokenAddress);
    const balance = await tokenContract.methods.balanceOf(wallet).call();
    return web3.utils.fromWei(balance, 'ether');
  } catch (error) {
    console.log(`Token balance error for ${wallet}, token ${tokenAddress}: ${error.message}`);
    return 'RPC Error';
  }
}

async function trackBalances() {
  console.log('Скрипт запущен, дождитесь выполнения программы.');

  if (wallets.length === 0 || networks.length === 0) {
    console.log('Нет кошельков или сетей для обработки.');
    return;
  }

  const data = [];
  const headers = ['Wallet Address'];

  for (const network of networks) {
    headers.push(`${network.name} Native`);
    network.tokens.forEach((token) => {
      headers.push(`${token}`);
    });
  }

  for (const wallet of wallets) {
    const row = [wallet];

    for (const network of networks) {
      const web3 = new Web3(network.rpcUrl);
      const nativeBalance = await getNativeBalance(web3, wallet);
      row.push(nativeBalance);

      for (const token of network.tokens) {
        const tokenBalance = await getTokenBalance(web3, wallet, token);
        row.push(tokenBalance);
      }

      await delay(DELAY_MIN, DELAY_MAX);
    }

    data.push(row);
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Balances');
  worksheet.addRow(headers);
  data.forEach(row => worksheet.addRow(row));
  await workbook.xlsx.writeFile('balances.xlsx');
  console.log('Данные записаны в balances.xlsx');
}

trackBalances().catch((error) => {
  console.error('Произошла ошибка:', error.message);
});
