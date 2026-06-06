// scripts/notify-line.js
// LINE Botで管理者にイベント候補を通知する（承認/却下のFlexメッセージ）

const axios = require('axios');

async function notifyEvents(events) {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const userId = process.env.LINE_USER_ID;

  if (!accessToken || !userId) {
    console.warn('⚠️  LINE_CHANNEL_ACCESS_TOKEN または LINE_USER_ID が未設定です');
    return;
  }

  for (const event of events) {
    const message = {
      to: userId,
      messages: [{
        type: 'flex',
        altText: `新着: ${event.titleJa}`,
        contents: {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#FFF8F0',
            paddingAll: '12px',
            contents: [{
              type: 'text',
              text: `${event.emoji}  ${event.type === 'sale' ? '新着セール' : '新着イベント'}`,
              size: 'xs',
              color: '#C8804A',
              weight: 'bold',
            }],
          },
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            paddingAll: '12px',
            contents: [
              {
                type: 'text',
                text: event.titleJa || event.title,
                weight: 'bold',
                size: 'md',
                wrap: true,
                color: '#2C2420',
              },
              {
                type: 'text',
                text: `📍 ${event.area || 'エリア不明'}`,
                size: 'sm',
                color: '#6B5E52',
              },
              {
                type: 'text',
                text: event.costLabel || (event.cost === 'free' ? '入場無料' : '有料'),
                size: 'sm',
                color: '#6B5E52',
              },
              {
                type: 'text',
                text: event.ticketRequired ? '⚠️ 要事前予約' : '🎟 予約不要',
                size: 'sm',
                color: '#6B5E52',
              },
              {
                type: 'text',
                text: `💡 ${event.tips?.[0] || ''}`,
                size: 'sm',
                wrap: true,
                color: '#6B5E52',
              },
              {
                type: 'text',
                text: event.link || '',
                size: 'xs',
                color: '#A0A0A0',
                wrap: true,
              },
            ],
          },
          footer: {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            paddingAll: '12px',
            contents: [
              {
                type: 'button',
                style: 'primary',
                color: '#6E9E88',
                height: 'sm',
                action: {
                  type: 'postback',
                  label: '✅ 掲載する',
                  data: `action=approve&id=${event.id}`,
                  displayText: '掲載します',
                },
              },
              {
                type: 'button',
                style: 'secondary',
                height: 'sm',
                action: {
                  type: 'postback',
                  label: '❌ スキップ',
                  data: `action=reject&id=${event.id}`,
                  displayText: 'スキップします',
                },
              },
            ],
          },
        },
      }],
    };

    try {
      await axios.post('https://api.line.me/v2/bot/message/push', message, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      console.log(`  📱 通知送信: ${event.titleJa}`);
    } catch (e) {
      console.error(`  ❌ LINE送信エラー: ${e.response?.data?.message || e.message}`);
    }
  }
}

module.exports = { notifyEvents };
