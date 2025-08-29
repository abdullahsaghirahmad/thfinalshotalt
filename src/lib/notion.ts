import { Client } from '@notionhq/client';

// Initialize Notion client
const notion = new Client({
  auth: process.env.NOTION_API_TOKEN,
});

export interface NotionEntry {
  id: string;
  title: string;
  status: string;
  content?: string;
  blocks?: any[];
  images?: string[];
  date: string;
  createdTime: string;
  lastEditedTime: string;
  url: string;
}

export interface NotionMusingsResponse {
  musings: NotionEntry[];
  hasMore: boolean;
  nextCursor?: string;
  total: number;
}

export async function getRandomMusings(cursor?: string, pageSize: number = 6): Promise<NotionMusingsResponse> {
  try {
    const databaseId = '041edb6d8d7f4af5b01cda8a2710d951';
    
    const response = await notion.databases.query({
      database_id: databaseId,
      filter: {
        property: 'Status',
        select: {
          equals: 'Random Musings'
        }
      },
      sorts: [
        {
          property: 'Date',
          direction: 'descending'
        }
      ],
      page_size: pageSize,
      ...(cursor && { start_cursor: cursor })
    });

    const musings = await Promise.all(response.results.map(async (page: any) => {
      const titleProp = page.properties.Name;
      const title = titleProp?.title?.[0]?.text?.content || 'Untitled';
      
      // Fetch page content blocks
      const blocks = await getNotionPageContent(page.id);
      
      // Extract text content and images from blocks
      let content = '';
      const images: string[] = [];
      
      blocks.forEach((block: any) => {
        if (block.type === 'paragraph' && block.paragraph?.rich_text) {
          const text = block.paragraph.rich_text.map((rt: any) => rt.plain_text).join('');
          if (text.trim()) content += text + '\n';
        } else if (block.type === 'heading_1' && block.heading_1?.rich_text) {
          const text = block.heading_1.rich_text.map((rt: any) => rt.plain_text).join('');
          if (text.trim()) content += text + '\n';
        } else if (block.type === 'heading_2' && block.heading_2?.rich_text) {
          const text = block.heading_2.rich_text.map((rt: any) => rt.plain_text).join('');
          if (text.trim()) content += text + '\n';
        } else if (block.type === 'heading_3' && block.heading_3?.rich_text) {
          const text = block.heading_3.rich_text.map((rt: any) => rt.plain_text).join('');
          if (text.trim()) content += text + '\n';
        } else if (block.type === 'bulleted_list_item' && block.bulleted_list_item?.rich_text) {
          const text = block.bulleted_list_item.rich_text.map((rt: any) => rt.plain_text).join('');
          if (text.trim()) content += '• ' + text + '\n';
        } else if (block.type === 'numbered_list_item' && block.numbered_list_item?.rich_text) {
          const text = block.numbered_list_item.rich_text.map((rt: any) => rt.plain_text).join('');
          if (text.trim()) content += '1. ' + text + '\n';
        } else if (block.type === 'image') {
          const imageUrl = block.image?.file?.url || block.image?.external?.url;
          if (imageUrl) images.push(imageUrl);
        }
      });
      
      return {
        id: page.id,
        title,
        status: page.properties.Status?.select?.name || '',
        content: content.trim(),
        blocks,
        images,
        date: page.properties.Date?.date?.start || page.created_time.split('T')[0],
        createdTime: page.created_time,
        lastEditedTime: page.last_edited_time,
        url: page.url
      };
    }));

    return {
      musings,
      hasMore: response.has_more,
      nextCursor: response.next_cursor,
      total: response.results.length
    };
  } catch (error) {
    console.error('Error fetching Random Musings from Notion:', error);
    return {
      musings: [],
      hasMore: false,
      total: 0
    };
  }
}

export async function getNotionPageContent(pageId: string): Promise<any> {
  try {
    const response = await notion.blocks.children.list({
      block_id: pageId,
    });
    return response.results;
  } catch (error) {
    console.error('Error fetching page content:', error);
    return [];
  }
}
