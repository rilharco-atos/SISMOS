import { Controller, Get, Param, Res, NotFoundException } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';

/***********************************************************************************************************************
* @class         AvatarsController
* @description   Public controller that serves user avatar image files from the local uploads directory.
*                No authentication is required — avatar images are semi-public (guessable by user ID but
*                not sensitive). Access is rate-limited implicitly by the upstream proxy/Nginx in production.
*
* @responsibilities
*                 - Serve PNG/JPG/WEBP avatar files from the uploads/avatars directory
*                 - Prevent directory traversal by using path.basename()
*                 - Return 404 when the file does not exist
*
* @lastupdate    03/11/2026
* @company       Atos
* @developer     Rui Ilharco
***********************************************************************************************************************/
@Controller('avatars')
export class AvatarsController {
  @Get(':filename')
  async serve(@Param('filename') filename: string, @Res() res: any) {
    const safe = path.basename(filename.split('?')[0]);
    const filePath = path.join(process.cwd(), 'uploads', 'avatars', safe);
    if (!fs.existsSync(filePath)) throw new NotFoundException('Avatar não encontrado');
    return res.sendFile(filePath);
  }
}
