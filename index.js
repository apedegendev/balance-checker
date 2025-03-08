const { Web3 } = require('web3');
const fs = require('fs');
const XLSX = require('xlsx');

// Настройка задержки (в секундах) прямо в коде, можно использовать дробные числа
const DELAY_MIN = 0.1; // Минимальная задержка в секундах (дробное число)
const DELAY_MAX = 0.3; // Максимальная задержка в секундах (дробное число)

// Функция для генерации случайной задержки в заданном диапазоне (в секундах)
function delay(minSeconds, maxSeconds) {
  // Генерируем случайное число в диапазоне [minSeconds, maxSeconds]
  const timeSeconds = Math.random() * (maxSeconds - minSeconds) + minSeconds;
  // Округляем до 2 знаков после запятой для удобства вывода
  const roundedTimeSeconds = parseFloat(timeSeconds.toFixed(2));
  const timeMs = roundedTimeSeconds * 1000; // Конвертируем секунды в миллисекунды
  console.log(`Задержка: ${roundedTimeSeconds} секунд`);
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
    console.error(`Ошибка при получении нативного баланса для ${wallet}:`, error.message);
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
    console.error(`Ошибка при получении баланса токена ${tokenAddress} для ${wallet}:`, error.message);
    return '0';
  }
}

// Основная функция для трекинга балансов
async function trackBalances() {
  if (wallets.length === 0) {
    console.log('Список кошельков пуст.');
    return;
  }

  if (networks.length === 0) {
    console.log('Список сетей пуст.');
    return;
  }

  console.log(`Начинаем проверку балансов (задержка между сетями: ${DELAY_MIN}-${DELAY_MAX} секунд)...\n`);

  // Массив для хранения данных для таблицы
  const data = [];
  // Заголовки таблицы
  const headers = ['Wallet Address'];

  // Формируем заголовки для каждой сети
  for (const network of networks) {
    // Всегда добавляем колонку для нативного баланса
    headers.push(`${network.name} (Native)`);

    // Если есть токены, добавляем колонки для них
    network.tokens.forEach((token, index) => {
      headers.push(`${network.name} Token ${index + 1} (${token})`);
    });
  }

  // Проверяем балансы для каждого кошелька
  for (const wallet of wallets) {
    console.log(`Кошелек: ${wallet}`);
    const row = [wallet];

    for (const network of networks) {
      const web3 = new Web3(network.rpcUrl);
      console.log(`Проверка в сети ${network.name}...`);

      // Всегда проверяем нативный баланс
      const nativeBalance = await getNativeBalance(web3, wallet);
      row.push(nativeBalance);
      console.log(`  Нативный баланс (${network.name}): ${nativeBalance}`);

      // Если есть токены, проверяем их балансы
      for (const token of network.tokens) {
        const tokenBalance = await getTokenBalance(web3, wallet, token);
        row.push(tokenBalance);
        console.log(`  Токен ${token} (${network.name}): ${tokenBalance}`);
      }

      // Добавляем случайную задержку между проверками сетей
      await delay(DELAY_MIN, DELAY_MAX);
    }

    data.push(row);
    console.log('------------------------');
  }

  // Создаем новую книгу Excel
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Balances');

  // Записываем файл
  XLSX.writeFile(wb, 'balances.xlsx');
  console.log('Данные записаны в balances.xlsx');
}

// Запускаем трекинг
trackBalances().catch((error) => {
  console.error('Произошла ошибка:', error.message);
});
