const { Web3 } = require('web3');
const fs = require('fs');
const ExcelJS = require('exceljs');

// Настройка задержки (в секундах) прямо в коде, можно использовать дробные числа
const DELAY_MIN = 0.1; // Минимальная задержка в секундах (дробное число)
const DELAY_MAX = 0.3; // Максимальная задержка в секундах (дробное число)

// Функция для генерации случайной задержки в заданном диапазоне (в секундах)
function delay(minSeconds, maxSeconds) {
  const timeSeconds = Math.random() * (maxSeconds - minSeconds) + minSeconds;
  const roundedTimeSeconds = parseFloat(timeSeconds.toFixed(2));
  const timeMs = roundedTimeSeconds * 1000; // Конвертируем секунды в миллисекунды
  return new Promise(resolve => setTimeout(resolve, timeMs));
}

// Читаем файл wallets.txt и преобразуем его в массив строк
const wallets = fs.readFileSync('wallets.txt', 'utf8')
  .split('\n')
  .map(wallet => wallet.trim())
  .filter(wallet => wallet && /^0x[a-fA-F0-9]{40}$/.test(wallet));

// Читаем файл networks.txt и преобразуем его в массив объектов
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

// Минимальный ABI для ERC-20 токена (нужен только метод balanceOf)
const erc20Abi = [
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    type: 'function',
  },
];

// Функция для получения баланса нативного токена
async function getNativeBalance(web3, wallet) {
  try {
    const balance = await web3.eth.getBalance(wallet);
    return web3.utils.fromWei(balance, 'ether');
  } catch (error) {
    return '0';
  }
}

// Функция для получения баланса ERC-20 токена
async function getTokenBalance(web3, wallet, tokenAddress) {
  try {
    const tokenContract = new web3.eth.Contract(erc20Abi, tokenAddress);
    const balance = await tokenContract.methods.balanceOf(wallet).call();
    return web3.utils.fromWei(balance, 'ether');
  } catch (error) {
    return '0';
  }
}

// Основная функция для трекинга балансов
async function trackBalances() {
  console.log('Скрипт запущен, дождитесь выполнения программы.');

  if (wallets.length === 0 || networks.length === 0) {
    return;
  }

  // Массив для хранения данных для таблицы
  const data = [];
  // Заголовки таблицы
  const headers = ['Wallet Address'];

  // Формируем заголовки для каждой сети
  for (const network of networks) {
    headers.push(`${network.name} Native`);
    network.tokens.forEach((token, index) => {
      headers.push(`${network.name} Token ${index + 1} (${token})`);
    });
  }

  // Проверяем балансы для каждого кошелька
  for (const wallet of wallets) {
    const row = [wallet];

    for (const network of networks) {
      const web3 = new Web3(network.rpcUrl);

      // Всегда проверяем нативный баланс
      const nativeBalance = await getNativeBalance(web3, wallet);
      row.push(nativeBalance);

      // Если есть токены, проверяем их балансы
      for (const token of network.tokens) {
        const tokenBalance = await getTokenBalance(web3, wallet, token);
        row.push(tokenBalance);
      }

      // Добавляем случайную задержку между проверками сетей
      await delay(DELAY_MIN, DELAY_MAX);
    }

    data.push(row);
  }

  // Создаем новую книгу Excel с помощью ExcelJS
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Balances');

  // Добавляем заголовки
  worksheet.addRow(headers);

  // Добавляем данные
  data.forEach(row => {
    worksheet.addRow(row);
  });

  // Сохраняем файл
  await workbook.xlsx.writeFile('balances.xlsx');
  console.log('Данные записаны в balances.xlsx');
}

// Запускаем трекинг
trackBalances().catch((error) => {
  console.error('Произошла ошибка:', error.message);
});
